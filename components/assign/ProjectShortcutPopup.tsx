"use client";
import { Button } from "@/components/ui/button";
import React from "react";

type Props = {
  open: boolean;
  position: { x: number; y: number };
  jobId?: string;
  onGenerate: () => void;
  onClose: () => void;
  containerRef?: React.RefObject<HTMLDivElement>;
};

export default function ProjectShortcutPopup({
  open,
  position,
  jobId,
  onGenerate,
  onClose,
  containerRef,
}: Props) {
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        containerRef?.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter") onGenerate();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, onGenerate, containerRef]);

  if (!open) return null;
  return (
    <div
      ref={containerRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 focus:outline-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        minWidth: "150px",
      }}
      tabIndex={-1}
    >
      <Button
        onClick={onGenerate}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 px-3"
        autoFocus
        disabled={!jobId}
        title={
          jobId
            ? `Generate Laporan DOCX untuk Job ${jobId}`
            : "Job ID tidak tersedia"
        }
      >
        Generate Laporan
      </Button>
    </div>
  );
}
