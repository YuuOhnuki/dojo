import * as React from 'react';
import { type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonSize = React.ComponentProps<typeof Button>['size'];

interface ActionButtonProps extends Omit<React.ComponentProps<typeof Button>, 'size'> {
    icon?: LucideIcon;
    iconPosition?: 'start' | 'end';
    fullWidth?: boolean;
    size?: ButtonSize;
}

export function ActionButton({
    icon: Icon,
    iconPosition = 'start',
    fullWidth = true,
    className,
    size = 'default',
    children,
    ...props
}: ActionButtonProps) {
    return (
        <Button
            size={size}
            className={cn('rounded-xl font-semibold transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0', fullWidth && 'w-full', className)}
            {...props}
        >
            {Icon && iconPosition === 'start' && <Icon className="size-4" />}
            <span>{children}</span>
            {Icon && iconPosition === 'end' && <Icon className="size-4" />}
        </Button>
    );
}

interface ActionButtonRowProps extends React.HTMLAttributes<HTMLDivElement> {
    cols?: 1 | 2;
}

export function ActionButtonRow({ className, cols = 1, ...props }: ActionButtonRowProps) {
    return (
        <div
            className={cn('grid gap-2', cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1', className)}
            {...props}
        />
    );
}
