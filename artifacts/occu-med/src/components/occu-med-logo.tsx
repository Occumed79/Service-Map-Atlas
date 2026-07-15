import { cn } from "@/lib/utils";

type OccuMedLogoProps = {
  className?: string;
  alt?: string;
};

export function OccuMedLogo({ className, alt = "Occu-Med" }: OccuMedLogoProps) {
  return (
    <img
      src="/occu-med-logo.png"
      alt={alt}
      className={cn("block object-contain", className)}
    />
  );
}
