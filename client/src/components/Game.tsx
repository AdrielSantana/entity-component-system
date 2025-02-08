import React, { useEffect, useRef, useState } from "react";
import { ClientGameLoop } from "../game/ClientGameLoop";
import { DebugOverlay } from "./DebugOverlay";

export const Game: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ClientGameLoop | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    // Initialize game when component mounts
    const initGame = () => {
      if (containerRef.current && !gameRef.current) {
        console.log("Initializing game instance");
        gameRef.current = new ClientGameLoop(containerRef.current);

        // Subscribe to debug updates
        gameRef.current.onDebugUpdate((info: any) => {
          setDebugInfo(info);
        });
      }
    };

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(initGame, 0);

    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
      if (gameRef.current) {
        console.log("Cleaning up game instance");
        gameRef.current.cleanup();
        gameRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures this only runs once on mount

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: "100vw",
          height: "100vh",
          position: "fixed",
          top: 0,
          left: 0,
          overflow: "hidden",
          backgroundColor: "#000", // Add background color to make it visible
        }}
      />
      {debugInfo && <DebugOverlay debugInfo={debugInfo.debug} />}
    </>
  );
};
