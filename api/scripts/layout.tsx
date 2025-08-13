import React, { ReactNode } from "react";

interface PostJobLayoutProps {
  children: ReactNode;
}

export default function PostJobLayout({ children }: PostJobLayoutProps) {
  // This layout should NOT include any sidebar components
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}