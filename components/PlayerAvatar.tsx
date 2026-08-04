import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  getInitials,
  getPlayerImageByExternalId,
  getPlayerImageByUserId,
} from '@/lib/player-images';
import { cn } from '@/lib/utils';

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
      {src && (
        <AvatarImage
          src={src}
          alt={name}
          className="rounded-2xl aspect-square object-cover"
        />
      )}
      <AvatarFallback
        className={cn('rounded-2xl bg-surface-2 font-semibold', fallbackClassName)}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
