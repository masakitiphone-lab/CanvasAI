"use client";

import { useState, HTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface MagicImageProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

export function MagicImage({
  src,
  alt = "",
  className,
  imageClassName,
  onError,
  onLoad,
  ...props
}: MagicImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[inherit] bg-neutral-100",
        className
      )}
      {...props}
    >
      {/* Aurora Placeholder */}
      <AnimatePresence>
        {!isLoaded && !hasError && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0 z-10 anim-aurora"
          />
        )}
      </AnimatePresence>

      {/* Actual Image */}
      {src && !hasError ? (
        <motion.img
          src={src}
          alt={alt}
          initial={{ opacity: 0, filter: "blur(10px)" }}
          animate={{
            opacity: isLoaded ? 1 : 0,
            filter: isLoaded ? "blur(0px)" : "blur(10px)",
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onLoad={(event) => {
            setIsLoaded(true);
            onLoad?.(event);
          }}
          onError={(event) => {
            setHasError(true);
            onError?.(event);
          }}
          className={cn(
            "h-full w-full object-cover transition-transform duration-500",
            imageClassName
          )}
          decoding="async"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-50 text-neutral-400">
          <span className="text-xs">No image</span>
        </div>
      )}
    </div>
  );
}
