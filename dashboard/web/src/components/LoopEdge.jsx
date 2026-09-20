import {
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position,
} from "@xyflow/react";

// Arc edge for non-adjacent hops:
//  - back-edges (verify→implement) exit bottom handles and dip below the row
//  - long forward skips (plan→END) exit top handles and arc over the row
// `data.offset` staggers parallel arcs so they never overlap.
export default function LoopEdge({
  id, sourceX, sourceY, targetX, targetY, style, markerEnd, label, data,
}) {
  const dir = data?.top ? Position.Top : Position.Bottom;
  const [path, lx, ly] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: dir,
    targetPosition: dir,
    borderRadius: 14,
    offset: data?.offset ?? 48,
  });
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="edge-loop-label"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
