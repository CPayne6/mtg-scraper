import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CacheService, QueueService, StoreService } from '@mtg-scraper/core';
import { mockCardWithStore, mockStores } from '@mtg-scraper/core/test';

describe('Card API (e2e)', () => {
  let app: INestApplication;
  let cacheService: CacheService;
  let queueService: QueueService;
  let storeService: StoreService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CacheService)
      .useValue({
        getCard: jest.fn(),
        isBeingScraped: jest.fn(),
        waitForScrapeCompletion: jest.fn(),
        markAsBeingScraped: jest.fn(),
      })
      .overrideProvider(QueueService)
      .useValue({
        enqueueScrapeJob: jest.fn(),
      })
      .overrideProvider(StoreService)
      .useValue({
        findAllActive: jest.fn().mockResolvedValue(mockStores),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();

    cacheService = moduleFixture.get<CacheService>(CacheService);
    queueService = moduleFixture.get<QueueService>(QueueService);
    storeService = moduleFixture.get<StoreService>(StoreService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /card/:cardName', () => {
    it('should return cached card data', async () => {
      const cardName = 'Black Lotus';
      const cachedCards = [{ ...mockCardWithStore, store: 'Face to Face Games' }];

      (cacheService.getCard as jest.Mock).mockResolvedValue(cachedCards);

      const response = await request(app.getHttpServer())
        .get(`/card/${cardName}`)
        .expect(200);

      expect(response.body).toHaveProperty('cardName', cardName);
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('priceStats');
      expect(response.body).toHaveProperty('stores');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.results).toHaveLength(1);
    });

    it('should handle card not found in cache', async () => {
      const cardName = 'Lightning Bolt';
      const scrapedCards = [{ ...mockCardWithStore, store: 'Face to Face Games' }];

      (cacheService.getCard as jest.Mock).mockResolvedValue(null);
      (cacheService.isBeingScraped as jest.Mock).mockResolvedValue(false);
      (cacheService.markAsBeingScraped as jest.Mock).mockResolvedValue(true);
      (cacheService.waitForScrapeCompletion as jest.Mock).mockResolvedValue(
        scrapedCards,
      );

      const response = await request(app.getHttpServer())
        .get(`/card/${cardName}`)
        .expect(200);

      expect(response.body.cardName).toBe(cardName);
      expect(queueService.enqueueScrapeJob).toHaveBeenCalledWith(
        cardName,
        10,
        expect.any(String),
      );
    });

    it('should handle card names with spaces', async () => {
      const cardName = 'Command Tower';
      (cacheService.getCard as jest.Mock).mockResolvedValue([]);
      (cacheService.isBeingScraped as jest.Mock).mockResolvedValue(true);
      (cacheService.waitForScrapeCompletion as jest.Mock).mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`/card/${encodeURIComponent(cardName)}`)
        .expect(200);

      expect(cacheService.getCard).toHaveBeenCalledWith(cardName);
    });

    it('should handle card names with special characters', async () => {
      const cardName = "Urza's Saga";
      (cacheService.getCard as jest.Mock).mockResolvedValue([]);
      (cacheService.isBeingScraped as jest.Mock).mockResolvedValue(true);
      (cacheService.waitForScrapeCompletion as jest.Mock).mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`/card/${encodeURIComponent(cardName)}`)
        .expect(200);

      expect(cacheService.getCard).toHaveBeenCalledWith(cardName);
    });

    it('should return correct price statistics', async () => {
      const cardName = 'Sol Ring';
      const cards = [
        { ...mockCardWithStore, price: 100, store: 'Store A' },
        { ...mockCardWithStore, price: 200, store: 'Store B' },
        { ...mockCardWithStore, price: 150, store: 'Store C' },
      ];

      (cacheService.getCard as jest.Mock).mockResolvedValue(cards);

      const response = await request(app.getHttpServer())
        .get(`/card/${cardName}`)
        .expect(200);

      expect(response.body.priceStats.min).toBe(100);
      expect(response.body.priceStats.max).toBe(200);
      expect(response.body.priceStats.avg).toBe(150);
      expect(response.body.priceStats.count).toBe(3);
    });

    it('should return store information with card counts', async () => {
      const cardName = 'Counterspell';
      const cards = [
        { ...mockCardWithStore, store: 'Face to Face Games' },
        { ...mockCardWithStore, store: 'Face to Face Games' },
        { ...mockCardWithStore, store: '401 Games' },
      ];

      (cacheService.getCard as jest.Mock).mockResolvedValue(cards);

      const response = await request(app.getHttpServer())
        .get(`/card/${cardName}`)
        .expect(200);

      const f2fStore = response.body.stores.find(
        (s: any) => s.displayName === 'Face to Face Games',
      );
      expect(f2fStore?.cardCount).toBe(2);

      const games401Store = response.body.stores.find(
        (s: any) => s.displayName === '401 Games',
      );
      expect(games401Store?.cardCount).toBe(1);
    });

    it('should handle empty results', async () => {
      const cardName = 'NonexistentCard';

      (cacheService.getCard as jest.Mock).mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get(`/card/${cardName}`)
        .expect(200);

      expect(response.body.results).toHaveLength(0);
      expect(response.body.priceStats.count).toBe(0);
      expect(response.body.priceStats.min).toBe(0);
      expect(response.body.priceStats.max).toBe(0);
      expect(response.body.priceStats.avg).toBe(0);
    });

    it('should sort stores alphabetically', async () => {
      const cardName = 'Mana Crypt';
      const cards = [
        { ...mockCardWithStore, store: 'Hobbiesville' },
        { ...mockCardWithStore, store: '401 Games' },
        { ...mockCardWithStore, store: 'Face to Face Games' },
      ];

      (cacheService.getCard as jest.Mock).mockResolvedValue(cards);

      const response = await request(app.getHttpServer())
        .get(`/card/${cardName}`)
        .expect(200);

      expect(response.body.stores[0].displayName).toBe('401 Games');
      expect(response.body.stores[1].displayName).toBe('Face to Face Games');
      expect(response.body.stores[2].displayName).toBe('Hobbiesville');
    });
  });

  describe('GET /health', () => {
    it('should return health check status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });
  });
});
