import { useEffect, useState } from "react";

type Project = { id: string; name: string; status: string; owner: string };
const API = "https://localhost:7034";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/api/Projects`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setProjects)
      .catch(e => setError(e.message));
  }, []);

  const chip = (s: string) =>
    s === "Active" ? "bg-green-100 text-green-700"
    : s === "InProgress" ? "bg-amber-100 text-amber-700"
    : "bg-blue-100 text-blue-700";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Project Management Tool</h1>
        <span className="text-sm">Alice Mwangi • Admin</span>
      </header>
      <main className="p-6 max-w-4xl mx-auto">
        <h2 className="text-lg font-semibold mb-4">Projects</h2>
        {error && <div className="mb-4 rounded bg-red-100 text-red-700 px-4 py-2">API unreachable: {error}</div>}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Owner</th></tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${chip(p.status)}`}>{p.status}</span></td>
                  <td className="px-4 py-2">{p.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}