
import { useQuery, gql } from '@apollo/client'
import {
  Alert, Box, Chip, LinearProgress, MenuItem, Skeleton, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'

// ── GraphQL queries ──────────────────────────────────────────────────────────

const PROJECTS_QUERY = gql`
  query AnalyticsProjects {
    projects {
      id
      seqNo
      name
      status
      owner
      startDate
      targetEndDate
    }
  }
`

const TASKS_QUERY = gql`
  query AnalyticsTasks($projectId: UUID!) {
    tasks(projectId: $projectId) {
      id
      title
      status
      priority
      dueDate
    }
  }
`

const USERS_QUERY = gql`
  query AnalyticsUsers {
    users {
      id
      fullName
      email
      role
      lastLoginAt
    }
  }
`

// ── Types ────────────────────────────────────────────────────────────────────

type GqlProject = {
  id: string; seqNo: number; name: string; status: string
  owner: string; startDate?: string | null; targetEndDate?: string | null
}
type GqlTask = { id: string; title: string; status: string; priority: string; dueDate?: string | null }
type GqlUser = { id: string; fullName: string; email: string; role: string; lastLoginAt?: string | null }

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'info' | 'default' | 'error'> = {
  Active: 'success', Completed: 'info', Stalled: 'warning', Inactive: 'default',
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="card dcard kpi" style={{ flex: '1 1 160px', minHeight: 0 }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 40 }}>{value}</div>
      {sub && <div className="kpi-note">{sub}</div>}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsPage({ muted }: { muted: string }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  const projects = useQuery<{ projects: GqlProject[] }>(PROJECTS_QUERY)
  const tasks = useQuery<{ tasks: GqlTask[] }>(TASKS_QUERY, {
    variables: { projectId: selectedProjectId },
    skip: !selectedProjectId,
  })
  const users = useQuery<{ users: GqlUser[] }>(USERS_QUERY)

  const projectList = projects.data?.projects ?? []
  const taskList = tasks.data?.tasks ?? []
  const userList = users.data?.users ?? []

  // Set first project as default once loaded
  useMemo(() => {
    if (!selectedProjectId && projectList.length > 0) setSelectedProjectId(projectList[0].id)
  }, [projectList, selectedProjectId])

  // Derived stats
  const byStatus = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of projectList) counts[p.status] = (counts[p.status] ?? 0) + 1
    return counts
  }, [projectList])

  const taskByStatus = useMemo(() => {
    const counts: Record<string, number> = { Todo: 0, InProgress: 0, Done: 0 }
    for (const t of taskList) counts[t.status] = (counts[t.status] ?? 0) + 1
    return counts
  }, [taskList])

  const overdue = useMemo(() => {
    const now = Date.now()
    return taskList.filter((t: any) => t.dueDate && Date.parse(t.dueDate) < now && t.status !== 'Done').length
  }, [taskList])

  const selectedProject = projectList.find((p: any) => p.id === selectedProjectId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Data source badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Chip label="Powered by GraphQL + Apollo Client" color="primary" size="small" variant="outlined" />
        <Typography variant="caption" sx={{ color: muted }}>
          Queries go to <code>/graphql</code> (HotChocolate) — not the REST API
        </Typography>
      </Box>

      {/* Error state */}
      {(projects.error || users.error) && (
        <Alert severity="error">
          GraphQL error: {projects.error?.message ?? users.error?.message}. Make sure the API is running.
        </Alert>
      )}

      {/* KPI row – workspace overview */}
      <div>
        <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>Workspace Overview</Typography>
        {projects.loading
          ? <Skeleton variant="rounded" height={96} />
          : <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatCard label="Total Projects" value={projectList.length} />
              <StatCard label="Active" value={byStatus['Active'] ?? 0} sub={`${Math.round(((byStatus['Active'] ?? 0) / Math.max(projectList.length, 1)) * 100)}% of all`} />
              <StatCard label="Completed" value={byStatus['Completed'] ?? 0} />
              <StatCard label="Stalled" value={byStatus['Stalled'] ?? 0} />
              <StatCard label="Registered Users" value={userList.length} />
            </div>}
      </div>

      {/* Status breakdown table */}
      <div className="card" style={{ padding: 20 }}>
        <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>Projects by Status</Typography>
        {projects.loading ? <Skeleton variant="rounded" height={120} /> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell align="right">Count</TableCell>
                <TableCell>Share</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <TableRow key={status}>
                  <TableCell><Chip size="small" label={status} color={STATUS_COLORS[status] ?? 'default'} /></TableCell>
                  <TableCell align="right">{count}</TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress variant="determinate" value={(count / projectList.length) * 100} sx={{ flex: 1, height: 8, borderRadius: 4 }} />
                      <Typography variant="caption">{Math.round((count / projectList.length) * 100)}%</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Per-project task deep-dive */}
      <div className="card" style={{ padding: 20 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Task Deep-Dive</Typography>
          <TextField select size="small" label="Project" value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)} sx={{ minWidth: 260 }}>
            {projectList.map((p: any) => (
              <MenuItem key={p.id} value={p.id}>#{p.seqNo} {p.name}</MenuItem>
            ))}
          </TextField>
        </Box>

        {selectedProject && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Chip size="small" label={selectedProject.status} color={STATUS_COLORS[selectedProject.status] ?? 'default'} />
            <Chip size="small" label={`Owner: ${selectedProject.owner}`} variant="outlined" />
            {selectedProject.targetEndDate && <Chip size="small" label={`Due: ${fmt(selectedProject.targetEndDate)}`} variant="outlined" />}
          </Box>
        )}

        {/* Task KPIs */}
        {tasks.loading && selectedProjectId
          ? <Skeleton variant="rounded" height={80} sx={{ mb: 2 }} />
          : taskList.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <StatCard label="Total Tasks" value={taskList.length} />
              <StatCard label="To Do" value={taskByStatus['Todo'] ?? 0} />
              <StatCard label="In Progress" value={taskByStatus['InProgress'] ?? 0} />
              <StatCard label="Done" value={taskByStatus['Done'] ?? 0} sub={`${Math.round(((taskByStatus['Done'] ?? 0) / Math.max(taskList.length, 1)) * 100)}% complete`} />
              {overdue > 0 && <StatCard label="Overdue" value={overdue} sub="past due date" />}
            </div>
          )}

        {/* Task list */}
        {tasks.loading && selectedProjectId
          ? <Skeleton variant="rounded" height={160} />
          : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Due date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {taskList.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.title}</TableCell>
                    <TableCell>{t.status}</TableCell>
                    <TableCell>
                      <Chip size="small" label={t.priority}
                        color={t.priority === 'High' ? 'error' : t.priority === 'Medium' ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell sx={{ color: t.dueDate && Date.parse(t.dueDate) < Date.now() && t.status !== 'Done' ? 'error.main' : 'inherit' }}>
                      {fmt(t.dueDate)}
                    </TableCell>
                  </TableRow>
                ))}
                {taskList.length === 0 && !tasks.loading && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography sx={{ py: 2, textAlign: 'center', color: muted }}>
                        {selectedProjectId ? 'No tasks for this project yet.' : 'Select a project to see its tasks.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </div>

      {/* User roster */}
      <div className="card" style={{ padding: 20 }}>
        <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>User Roster</Typography>
        {users.loading ? <Skeleton variant="rounded" height={120} /> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Last login</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {userList.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell>{u.fullName}</TableCell>
                  <TableCell><a className="email-link" href={`mailto:${u.email}`}>{u.email}</a></TableCell>
                  <TableCell><Chip size="small" label={u.role} /></TableCell>
                  <TableCell>{fmt(u.lastLoginAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

    </div>
  )
}
