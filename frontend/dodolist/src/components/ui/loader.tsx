import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import * as React from "react";

interface LoaderProps extends React.SVGAttributes<SVGSVGElement> {
    size?: number | string;
}

const Loader = React.forwardRef<SVGSVGElement, LoaderProps>(({ className, size = 20, ...props }, ref) => {
    return (
        <Loader2
            ref={ref}
            className={cn("animate-spin", className)}
            style={{ width: size, height: size }}
            {...props}
        />
    );
});

Loader.displayName = "Loader";

export { Loader };
