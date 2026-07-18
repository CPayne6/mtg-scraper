import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';

const BUY_ME_A_COFFEE_SCRIPT = 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js';

export function BuyMeAPackButton() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const originalWriteln = document.writeln;
    const captureMarkup = (...markup: string[]) => {
      container.innerHTML = markup.join('');
      const button = container.querySelector<HTMLElement>('.bmc-btn');
      const icon = container.querySelector<SVGElement>('.bmc-btn svg');

      if (button) {
        button.style.minWidth = '178px';
        button.style.height = '48px';
        button.style.padding = '0 18px';
        button.style.fontSize = '23px';
      }
      icon?.style.setProperty('height', '26px', 'important');
    };
    document.writeln = captureMarkup;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = BUY_ME_A_COFFEE_SCRIPT;
    script.setAttribute('data-name', 'bmc-button');
    script.setAttribute('data-slug', 'crp6');
    script.setAttribute('data-color', '#d99647');
    script.setAttribute('data-emoji', '🃏');
    script.setAttribute('data-font', 'Cookie');
    script.setAttribute('data-text', 'Buy me a pack');
    script.setAttribute('data-outline-color', '#000000');
    script.setAttribute('data-font-color', '#000000');
    script.setAttribute('data-coffee-color', '#FFDD00');
    script.onload = () => {
      document.writeln = originalWriteln;
    };
    document.head.appendChild(script);

    return () => {
      if (document.writeln === captureMarkup) {
        document.writeln = originalWriteln;
      }
      script.remove();
      container.replaceChildren();
    };
  }, []);

  return (
    <Box ref={containerRef} />
  );
}
