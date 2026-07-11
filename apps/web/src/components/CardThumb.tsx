import { useState } from 'react';
import type { Card } from '@riftvault/types';
import { thumbUrl } from '../api';

export function CardThumb({ card }: { card: Card }) {
  const [failed, setFailed] = useState(false);
  if (failed || !card.image_url) {
    return <div className="thumb placeholder">{card.name}</div>;
  }
  return (
    <img
      className="thumb"
      src={thumbUrl(card.id)}
      alt={card.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
