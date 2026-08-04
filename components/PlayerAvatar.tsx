import Image from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  getInitials,
  getPlayerImageByExternalId,
  getPlayerImageByUserId,
} from '@/lib/player-images';
import { cn } from '@/lib/utils';

/** Largest rendered avatar; `next/image` derives the 1x/2x srcset from it. */
const RENDER_SIZE = 128;

interface PlayerAvatarProps {
  name: string;
  externalPlayerId?: number | null;
  userId?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function PlayerAvatar({
  name,
  externalPlayerId,
  userId,
  className,
  fallbackClassName,
}: PlayerAvatarProps) {
  const src = getPlayerImageByExternalId(externalPlayerId) ?? getPlayerImageByUserId(userId);

  return (
    <Avatar className={cn('rounded-2xl after:rounded-2xl', className)}>
      {src ? (
        <Image
          src={src}
          alt={name}
          width={RENDER_SIZE}
          height={RENDER_SIZE}
          className="aspect-square size-full rounded-2xl object-cover"
        />
      ) : (
        <AvatarFallback
          className={cn('rounded-2xl bg-surface-2 font-semibold', fallbackClassName)}
        >
          {getInitials(name)}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
