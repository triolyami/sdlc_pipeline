import { useEffect, useMemo } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MarkerType,
  useNodesState, useEdgesState,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import StageNode, { EndNode } from "./StageNode.jsx";
import LoopEdge from "./LoopEdge.jsx";

const NODE_W = 190, NODE_H = 64, END_W = 110, END_H = 46;
const nodeTypes = { stage: StageNode, end: EndNode };
const edgeTypes = { loop: LoopEdge };

function layoutGraph(pipeline) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 52, ranksep: 120, marginx: 30, marginy: 30 });
  for (const name of Object.keys(pipeline.stages))
    g.setNode(name, { width: NODE_W, height: NODE_H });
  g.setNode("END", { width: END_W, height: END_H });
  const pairs = new Set();
  for (const t of pipeline.transitions) {
    const k = `${t.from}->${t.to}`;
    if (!pairs.has(k)) { pairs.add(k); g.setEdge(t.from, t.to); }
  }
  Dagre.layout(g);
  const pos = {};
  for (const name of [...Object.keys(pipeline.stages), "END"]) {
    const n = g.node(name);
    pos[name] = { x: n.x - n.width / 2, y: n.y - n.height / 2 };
  }
  return pos;
}

function nodeState(name, run) {
  if (!run) return "idle";
  if (run.awaiting?.stage === name) return "waiting";
  if (run.current === name) return "running";
  return run.stages?.[name]?.status || "idle";
}

// positions only depend on the pipeline definition — compute once
let posCache = { key: null, pos: null };
function positions(pipeline) {
  const key = JSON.stringify(Object.keys(pipeline.stages)) +
    JSON.stringify(pipeline.transitions);
  if (posCache.key !== key) posCache = { key, pos: layoutGraph(pipeline) };
  return posCache.pos;
}

function buildGraph(pipeline, run) {
  const pos = positions(pipeline);

  const taken = new Set();
  const attempts = {};
  let lastTaken = null;
  for (const e of run?.events || []) {
    if (e.type === "transition") {
      lastTaken = `${e.stage}:${e.status}:${e.to}`;
      taken.add(lastTaken);
    } else if (e.type === "stage_finished") {
      attempts[e.stage] = (attempts[e.stage] || 0) + 1;
    }
  }

  const nodes = Object.entries(pipeline.stages).map(([name, s]) => ({
    id: name,
    type: "stage",
    position: pos[name],
    data: {
      label: name,
      adapter: s.adapter,
      state: nodeState(name, run),
      attempts: attempts[name] || 0,
    },
    draggable: false,
  }));
  nodes.push({
    id: "END",
    type: "end",
    position: pos.END,
    data: { label: run?.outcome === "completed" ? "done" : "end", state: run?.outcome },
    draggable: false,
  });

  // merge parallel edges into one labelled edge per (from,to) pair
  const grouped = {};
  for (const t of pipeline.transitions)
    (grouped[`${t.from}->${t.to}`] ||= []).push(t);

  // non-adjacent edges get arc routing: back-edges loop below the row,
  // long forward skips (plan→END) arc above it. Widest jumps get the
  // outermost lane so arcs never overlap.
  const groupList = Object.entries(grouped);
  const span = (l) => pos[l[0].to].x - pos[l[0].from].x;
  const back = groupList.filter(([, l]) => span(l) < 0)
    .sort(([, la], [, lb]) => span(lb) - span(la));   // narrowest first
  const skip = groupList.filter(([, l]) => span(l) > 420)
    .sort(([, la], [, lb]) => span(la) - span(lb));   // narrowest first
  const offsets = {};
  back.forEach(([k], i) => { offsets[k] = 52 + i * 26; });
  skip.forEach(([k], i) => { offsets[k] = 44 + i * 24; });

  const edges = groupList.map(([key, list]) => {
    const [t] = list;
    const isBack = span(list) < 0;
    const isSkip = span(list) > 420;
    const wasTaken = list.some((x) => taken.has(`${x.from}:${x.status}:${x.to}`));
    const isLive =
      list.some((x) => `${x.from}:${x.status}:${x.to}` === lastTaken) &&
      (run?.current || run?.awaiting);
    const bad = list.every((x) => x.status === "fail" || x.status === "reject");
    const stroke = isLive
      ? "var(--color-accent)"
      : wasTaken
        ? bad ? "var(--color-bad)" : "#8b8b93"
        : "#3a3a41";
    return {
      id: key,
      source: t.from,
      target: t.to,
      type: isBack || isSkip ? "loop" : "smoothstep",
      sourceHandle: isBack ? "sb" : isSkip ? "st" : "r",
      targetHandle: isBack ? "tb" : isSkip ? "tt" : "l",
      pathOptions: { borderRadius: 14 },
      data: { offset: offsets[key], top: isSkip },
      label: list.map((x) => x.status).join(" / "),
      className: isLive ? "edge-live" : "",
      style: {
        stroke,
        strokeWidth: isLive ? 2 : 1.5,
        strokeDasharray: isBack && !isLive ? "6 5" : undefined,
        opacity: bad && wasTaken ? 0.55 : 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 22,
        height: 22,
        color: stroke,
      },
    };
  });
  return { nodes, edges };
}

function sameNode(a, b) {
  return a.type === b.type &&
    a.position.x === b.position.x && a.position.y === b.position.y &&
    JSON.stringify(a.data) === JSON.stringify(b.data);
}

export default function PipelineGraph({ pipeline, run }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // `run` is referentially stable between polls (App dedupes on content),
  // so the desired graph is only rebuilt when the visual state really changes.
  const desired = useMemo(() => buildGraph(pipeline, run), [pipeline, run]);

  useEffect(() => {
    // Reconcile instead of replacing: reusing an identical node object keeps
    // its internals (measured size, handle bounds) valid; for changed nodes we
    // carry `measured` forward (written back by onNodesChange) so the node
    // stays initialized and edges are never dropped pending re-measurement.
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return desired.nodes.map((n) => {
        const old = byId.get(n.id);
        if (!old) return n;
        return sameNode(old, n) ? old : { ...n, measured: old.measured };
      });
    });
    setEdges(desired.edges);
  }, [desired, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
      minZoom={0.4}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      elementsSelectable={false}
      className="xy-theme"
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#1c1c20" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
