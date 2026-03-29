#!/bin/bash
for i in $(seq 1 6); do
  echo "=== Check $i ($(date +%H:%M:%S)) ==="

  DA=$(docker exec scoutlgs-redis-dev redis-cli LLEN bull:product-discovery:active 2>/dev/null)
  EA=$(docker exec scoutlgs-redis-dev redis-cli LLEN bull:product-extraction:active 2>/dev/null)
  EW=$(docker exec scoutlgs-redis-dev redis-cli ZCARD bull:product-extraction:prioritized 2>/dev/null)

  echo "  Discovery active: $DA"
  echo "  Extraction active: $EA | waiting: $EW"

  docker exec scoutlgs-postgres-dev psql -U postgres -d scoutlgs -t -c \
    "SELECT extraction_status || ': ' || COUNT(*) FROM product_urls GROUP BY extraction_status ORDER BY COUNT(*) DESC;" 2>/dev/null

  docker stats --no-stream --format "  {{.Name}}: CPU={{.CPUPerc}} MEM={{.MemUsage}}" 2>/dev/null | grep -E "(scraper|postgres|redis)"

  echo ""
  sleep 30
done
