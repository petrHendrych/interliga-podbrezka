/**
 * Photos live in `public/players/` and are keyed by a stable identifier rather than
 * by name: scraper name spelling can change and surnames can collide.
 * Players are keyed by their external (scraper) id; trainers and admins have none,
 * so they are keyed by their `users.id`.
 */
const IMAGES_BY_EXTERNAL_ID: Record<number, string> = {
  19728: '/players/magala.jpg',
  20299: '/players/vadovic.jpg',
  20805: '/players/petras.jpg',
  169214: '/players/bina.jpg',
  169215: '/players/vesely.jpg',
  170511: '/players/hendrych.jpg',
  170512: '/players/gorecky.jpg',
  171890: '/players/kozma.jpg',
  19055: '/players/dubrava.jpg',
};

const IMAGES_BY_USER_ID: Record<string, string> = {
  '20c77448-faf2-4489-be47-a11aa2e07120': '/players/ponjavic.jpg',
};

export function getPlayerImageByExternalId(externalPlayerId: number | null | undefined) {
  if (externalPlayerId === null || externalPlayerId === undefined) return undefined;
  return IMAGES_BY_EXTERNAL_ID[externalPlayerId];
}

export function getPlayerImageByUserId(userId: string | null | undefined) {
  if (!userId) return undefined;
  return IMAGES_BY_USER_ID[userId];
}

export function getInitials(...parts: (string | null | undefined)[]) {
  return parts
    .flatMap((part) => (part ?? '').trim().split(/\s+/))
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
}
