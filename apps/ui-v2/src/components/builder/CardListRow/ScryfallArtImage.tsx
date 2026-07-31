import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { artUrl, scryfallImageQueue } from './CardListRow.utils';

type ScryfallArtImageProps = {
  name: string;
  scrollRoot: Element | null;
};

/**
 * Loads row artwork only when it approaches the viewport. The URL is released
 * through a shared queue so a large card list cannot burst Scryfall's API
 * rate limit and leave some rows without art.
 */
export function ScryfallArtImage({ name, scrollRoot }: ScryfallArtImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { root: scrollRoot, rootMargin: '160px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    void scryfallImageQueue.enqueue(artUrl(name)).then((url) => {
      if (active) setSource(url);
    });
    return () => {
      active = false;
    };
  }, [name, shouldLoad]);

  return (
    <Box
      ref={containerRef}
      aria-hidden="true"
      sx={{ position: 'absolute', inset: 0 }}
    >
      {source && (
        <Box
          component="img"
          src={source}
          alt=""
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 35%',
            display: 'block',
          }}
        />
      )}
    </Box>
  );
}
