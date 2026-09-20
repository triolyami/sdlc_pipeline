const j = (r) => {
  if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.error || r.statusText)));
  return r.json();
};

export const api = {
  pipeline: () => fetch("/api/pipeline").then(j),
  runs: () => fetch("/api/runs").then(j),
  runEvents: (id) => fetch(`/api/runs/${id}/events`).then(j),
  startRun: (task, mock, workspace) =>
    fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, mock, workspace }),
    }).then(j),
  approval: (id, decision, comment) =>
    fetch(`/api/runs/${id}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment }),
    }).then(j),
  resume: (id) => fetch(`/api/runs/${id}/resume`, { method: "POST" }).then(j),
  stop: (id) => fetch(`/api/runs/${id}/stop`, { method: "POST" }).then(j),
};
