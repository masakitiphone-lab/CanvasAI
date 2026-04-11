"use client"

import { cn } from "@/lib/utils"

interface BorderBeamProps {
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
  className?: string
  borderWidth?: number
}

export const BorderBeam = ({
  className,
  size = 300,
  duration = 4,
  colorFrom = "#818cf8",
  colorTo = "#c084fc",
  borderWidth = 2,
}: BorderBeamProps) => {
  return (
    <div
      style={
        {
          "--size": `${size}px`,
          "--duration": `${duration}s`,
          "--color-from": colorFrom,
          "--color-to": colorTo,
          "--border-width": `${borderWidth}px`,
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] border-[length:var(--border-width)] border-transparent",
        "![mask-clip:padding-box,border-box] ![mask-composite:intersect] [mask:linear-gradient(transparent,transparent),linear-gradient(white,white)]",
        className
      )}
    >
      <div 
        className="absolute top-1/2 left-1/2 aspect-square w-[300%] animate-border-beam"
        style={{
          background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, transparent 330deg, var(--color-from) 345deg, var(--color-to) 360deg)`,
        }}
      />
    </div>
  )
}
