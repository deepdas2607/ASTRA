"use client";

import { useState, useEffect } from "react";

interface TypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  loop?: boolean;
  loopDelay?: number;
  className?: string;
}

export default function Typewriter({
  text,
  speed = 50,
  delay = 0,
  loop = false,
  loopDelay = 2000,
  className = "",
}: TypewriterProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setIsStarted(true);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [delay]);

  useEffect(() => {
    if (!isStarted) return;

    if (displayedText.length < text.length) {
      const charTimeout = setTimeout(() => {
        setDisplayedText(text.slice(0, displayedText.length + 1));
      }, speed);
      return () => clearTimeout(charTimeout);
    } else if (loop) {
      const loopTimeout = setTimeout(() => {
        setDisplayedText("");
      }, loopDelay);
      return () => clearTimeout(loopTimeout);
    }
  }, [displayedText, text, speed, isStarted, loop, loopDelay]);

  return <span className={className}>{displayedText}</span>;
}
