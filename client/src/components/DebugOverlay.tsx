import React from "react";

interface DebugInfo {
  performance: {
    frameTime: number;
    physicsTime: number;
    networkTime: number;
    renderTime: number;
    fps: number;
    entityCount: number;
    updateSystemCount: number;
    networkSystemCount: number;
  };
  entities: Array<{
    id: string;
    name: string;
    position?: { x: number; y: number; z: number };
    hasUpdate: boolean;
    hasNetwork: boolean;
  }>;
}

interface Props {
  debugInfo: DebugInfo;
}

export const DebugOverlay: React.FC<Props> = ({ debugInfo }) => {
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          padding: "10px",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          color: "white",
          fontFamily: "monospace",
          fontSize: "12px",
          maxWidth: "300px",
          maxHeight: "100vh",
          overflowY: "auto",
          zIndex: 1000,
        }}
      >
        <h3>Performance</h3>
        <div>FPS: {debugInfo.performance.fps}</div>
        <div>Frame Time: {debugInfo.performance.frameTime.toFixed(3)}ms</div>
        <div>
          Physics Time: {debugInfo.performance.physicsTime.toFixed(3)}ms
        </div>
        <div>
          Network Time: {debugInfo.performance.networkTime.toFixed(3)}ms
        </div>
        <div>Render Time: {debugInfo.performance.renderTime.toFixed(3)}ms</div>
        <div>Entity Count: {debugInfo.performance.entityCount}</div>
        <div>Update System: {debugInfo.performance.updateSystemCount}</div>
        <div>Network System: {debugInfo.performance.networkSystemCount}</div>

        <h3>Entities</h3>
        {debugInfo.entities.map((entity) => (
          <div key={entity.id} style={{ marginBottom: "8px" }}>
            <div style={{ fontWeight: "bold" }}>
              {entity.name} ({entity.id})
            </div>
            {entity.position && (
              <div>
                Pos: ({entity.position.x.toFixed(2)},{" "}
                {entity.position.y.toFixed(2)}, {entity.position.z.toFixed(2)})
              </div>
            )}
            <div>
              {entity.hasUpdate && "⚡"} {/* Has update method */}
              {entity.hasNetwork && "🌐"} {/* Has network component */}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
