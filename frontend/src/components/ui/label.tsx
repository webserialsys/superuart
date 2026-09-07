import * as React from "react";

import { cn } from "@/lib/utils";

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  htmlFor: string;
  children: React.ReactNode;
};

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, htmlFor, children, ...props }, ref) => (
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    >
      {children}
    </label>
  ),
);
Label.displayName = "Label";

export { Label };
