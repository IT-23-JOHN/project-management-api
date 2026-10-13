import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ThemeProvider, StyledEngineProvider, createTheme, CssBaseline, Typography, Button, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert, Skeleton,
  Tooltip, Box, MenuItem, Menu, Badge, Divider, Snackbar, Table, TableBody, TableCell,
  TableHead, TableRow,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import BlockIcon from '@mui/icons-material/Block'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import SearchIcon from '@mui/icons-material/Search'
import LogoutIcon from '@mui/icons-material/Logout'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined'
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import LaunchOutlinedIcon from '@mui/icons-material/LaunchOutlined'
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward'
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import BarChartIcon from '@mui/icons-material/BarChart'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { ApolloProvider } from '@apollo/client'
import apolloClient from './apolloClient'
import AnalyticsPage from './AnalyticsPage'
import './griot.css'

const API = 'http://localhost:5241'
const UNDO_MS = 8000
const SESSION_KEY = 'pm_session'
const THEME_KEY = 'pm_theme'

const STATUSES = ['Active', 'Inactive', 'Completed', 'Stalled'] as const
const FILTERS = ['All', ...STATUSES] as const
type Filter = (typeof FILTERS)[number]
type SortKey = 'seq' | 'name' | 'status' | 'start'
type Page = 'dashboard' | 'admin' | 'projects' | 'board' | 'analytics' | 'users' | 'collaborators'
type DialogMode = 'create' | 'edit' | 'view' | null
type ThemePref = 'Light' | 'Dark' | 'System'
type SessionUser = {
  id: string
  fullName: string
  email: string
  role: string
  authCodeLast4?: string
  currentProjectId?: string | null
    projectRole?: string | null
    themePreference?: string
}

type Project = {
  id: string
  seqNo?: number
  name: string
  description?: string | null
  status: string
  owner: string
  ownerId?: string
  startDate: string | null
  targetEndDate: string | null
  isDeleted?: boolean
}
type User = {
  id: string
  fullName: string
  email: string
  role: string
  createdAt: string
  authCodeLast4?: string
  lastLoginAt?: string | null
  isActive: boolean
}
type Collaborator = { userId: string; fullName: string; email: string; role: string; joinedAt: string; accepted: boolean }
type AuditLogItem = {
  id: string
  actorUserId?: string | null
  actionType: string
  targetType: string
  targetId: string
  details?: string | null
  createdAt: string
}
type DeletedProjectItem = {
  id: string
  seqNo: number
  name: string
  status: string
  owner: string
  deletedAt: string
  restoreUntil: string
  retentionDays: number
}
type Dashboard = {
  id: string
  name: string
  status: string
  totalTasks: number
  doneTasks: number
  inProgressTasks: number
  completionPercent: number | null
}
type Metrics = {
  usersCount: number
  projectsCreatedCount: number
  projectsCompletedCount: number
  projectsStalledCount: number
}
type ProjectForm = { name: string; description: string; status: string; startDate: string; targetEndDate: string; statusReason: string }
const emptyForm: ProjectForm = { name: '', description: '', status: 'Active', startDate: '', targetEndDate: '', statusReason: '' }

function loadSession(): { token: string; user: SessionUser } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const client = axios.create({ baseURL: API })
client.interceptors.request.use(config => {
  const session = loadSession()
  if (session?.token) config.headers.Authorization = `Bearer ${session.token}`
  return config
})
// Sessions now expire. If the API says "not signed in", return to the login screen instead of showing a broken page.
client.interceptors.response.use(
  r => r,
  err => {
    const url = String(err?.config?.url ?? '')
    if (err?.response?.status === 401 && !url.includes('/api/auth/') && sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.removeItem(SESSION_KEY)
      window.location.reload()
    }
    return Promise.reject(err)
  },
)

function resolvedMode(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'Light') return 'light'
  if (pref === 'Dark') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function isAdminRole(role: string, id?: string) {
  if (/admin|manager/i.test(role)) return true
  return id?.toLowerCase() === 'd3aa997e-25d2-48e8-bbfa-b79eee83909e'
}

const statusLabel = (s: string) => (s === 'InProgress' ? 'In Progress' : s)
function StatusPill({ status }: { status: string }) {
  const k = status === 'Active' ? 'active' : status === 'Completed' ? 'completed' : status === 'Stalled' ? 'stalled' : 'inactive'
  return <span className={`pill s-${k}`}>{statusLabel(status)}</span>
}
const statusKey = (s: string) => (s === 'Active' ? 'active' : s === 'Completed' ? 'completed' : s === 'Stalled' ? 'stalled' : 'inactive')
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
const dayDiff = (d: string) => {
  const end = new Date(d.slice(0, 10) + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - t.getTime()) / 86400000)
}
function dueLabel(date: string | null | undefined, finished: boolean): { label: string; tone: 'late' | 'soon' } | null {
  if (!date || finished) return null
  const n = dayDiff(date)
  if (n < 0) return { label: `Overdue ${-n}d`, tone: 'late' }
  if (n === 0) return { label: 'Due today', tone: 'soon' }
  if (n <= 7) return { label: `Due in ${n}d`, tone: 'soon' }
  return null
}
const dueInfo = (p: Project) => dueLabel(p.targetEndDate, p.status === 'Completed')
function DueBadge({ p }: { p: Project }) {
  const d = dueInfo(p)
  return d ? <span className={`pill due-${d.tone}`}>{d.label}</span> : null
}
function useCountUp(target: number, ms = 800) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [val, setVal] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced) return
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const e = 1 - Math.pow(1 - t, 3)
      const next = Math.round(a + (target - a) * e)
      from.current = next
      setVal(next)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduced])
  return reduced ? target : val
}
function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const v = useCountUp(value)
  return <>{v}{suffix}</>
}
const rank = (s: string) => {
  const i = (STATUSES as readonly string[]).indexOf(s as typeof STATUSES[number])
  return i === -1 ? 99 : i
}
const toInputDate = (d: string | null | undefined) => (d ? d.slice(0, 10) : '')
const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function formFromProject(p: Project): ProjectForm {
  return {
    name: p.name,
    description: p.description ?? '',
    status: p.status,
    startDate: toInputDate(p.startDate),
    targetEndDate: toInputDate(p.targetEndDate),
    statusReason: '',
  }
}

export default function App() {
  const qc = useQueryClient()
  const [session, setSession] = useState(() => loadSession())
  const signedIn = !!session?.user
  const user = session?.user
  const admin = !!user && isAdminRole(user.role, user.id)

  const [themePref, setThemePref] = useState<ThemePref>(() => (localStorage.getItem(THEME_KEY) as ThemePref) || 'System')
  const [mode, setMode] = useState<'light' | 'dark'>(() => resolvedMode((localStorage.getItem(THEME_KEY) as ThemePref) || 'System'))
  const theme = useMemo(() => {
    const dark = mode === 'dark'
    const green = dark ? '#3fb27a' : '#17653f'
    return createTheme({
      palette: {
        mode,
        primary: { main: green, contrastText: dark ? '#06180f' : '#ffffff' },
        success: { main: green },
        info: { main: dark ? '#6bb8d6' : '#2b7a9b' },
        warning: { main: dark ? '#e3a54f' : '#c8791a' },
        error: { main: dark ? '#e08a85' : '#b4443f' },
        background: { default: dark ? '#080d0b' : '#eceeed', paper: dark ? '#141c18' : '#ffffff' },
        text: { primary: dark ? '#e8f0ec' : '#0e1c15', secondary: dark ? '#8a9890' : '#7b8780' },
        divider: dark ? '#212c26' : '#e6e9e7',
      },
      shape: { borderRadius: 14 },
      typography: {
        fontFamily: "'Plus Jakarta Sans', Inter, 'Segoe UI', system-ui, sans-serif",
        button: { textTransform: 'none', fontWeight: 600 },
      },
      components: {
        MuiButton: { styleOverrides: { root: { borderRadius: 999, paddingInline: 20 } } },
        MuiDialog: { styleOverrides: { paper: { borderRadius: 24, backgroundImage: 'none' } } },
        MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 14 } } },
        MuiTableCell: {
          styleOverrides: {
            root: { borderBottom: '1px solid var(--border)', fontSize: '0.88rem' },
            head: { color: 'var(--muted)', fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap' },
          },
        },
        MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', borderRadius: 999 } } },
        MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
        MuiPopover: { styleOverrides: { paper: { borderRadius: 18, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', backgroundImage: 'none' } } },
        MuiSnackbarContent: { styleOverrides: { root: { borderRadius: 16 } } },
      },
    })
  }, [mode])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    localStorage.setItem(THEME_KEY, themePref)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (themePref === 'System') setMode(resolvedMode('System')) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themePref, mode])

  const changeTheme = (pref: ThemePref) => {
    setThemePref(pref)
    setMode(resolvedMode(pref))
    if (loadSession()?.token) client.patch('/api/users/me', { themePreference: pref }).catch(() => {})
  }

  const [page, setPage] = useState<Page>('dashboard')
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [filter, setFilter] = useState<Filter>('All')
  const [ownerFilter, setOwnerFilter] = useState<'all'|'mine'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('seq')
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [undo, setUndo] = useState<Project | null>(null)
  const [collabProject, setCollabProject] = useState<Project | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('Editor')
  const searchRef = useRef<HTMLInputElement>(null)
  const [bellEl, setBellEl] = useState<HTMLElement | null>(null)
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const muted = 'var(--muted)'

  const [projectContext, setProjectContext] = useState<{ id: string; name: string; role: string } | null>(() => {
    if (session?.user?.currentProjectId) {
      return { id: session.user.currentProjectId, name: 'Active Project', role: session.user.projectRole || 'Editor' }
    }
    return null
  })

  const { data: projects = [], isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: () => client.get<Project[]>('/api/projects').then(r => r.data),
    enabled: signedIn,
    refetchInterval: 10000,
  })

  const { data: users = [], isLoading: usersLoading, isError: usersError } = useQuery({
    queryKey: ['users'],
    queryFn: () => client.get<User[]>('/api/users').then(r => r.data),
    enabled: signedIn && (page === 'dashboard' || page === 'board' || page === 'admin' || page === 'users' || page === 'collaborators'),
    refetchInterval: 15000,
  })

  const { data: metrics } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => client.get<Metrics>('/api/admin/metrics').then(r => r.data),
    enabled: signedIn && admin && page === 'admin',
    refetchInterval: 10000,
  })

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => client.get<AuditLogItem[]>('/api/admin/audit-logs').then(r => r.data),
    enabled: signedIn && admin && page === 'admin',
    refetchInterval: 10000,
  })

  const { data: deletedProjects = [] } = useQuery({
    queryKey: ['admin-deleted-projects'],
    queryFn: () => client.get<DeletedProjectItem[]>('/api/admin/deleted-projects').then(r => r.data),
    enabled: signedIn && admin && page === 'admin',
    refetchInterval: 10000,
  })

  const { data: dashboard, isFetching: dashLoading } = useQuery({
    queryKey: ['project-dashboard', editing?.id],
    queryFn: () => client.get<Dashboard>(`/api/projects/${editing!.id}/dashboard`).then(r => r.data),
    enabled: signedIn && dialog === 'view' && !!editing,
    retry: false,
  })

  const { data: collaborators = [], isLoading: collabLoading } = useQuery({
    queryKey: ['collaborators', collabProject?.id],
    queryFn: () => client.get<Collaborator[]>(`/api/projects/${collabProject!.id}/collaborators`).then(r => r.data),
    enabled: signedIn && page === 'collaborators' && !!collabProject,
    refetchInterval: 10000,
  })

  const [boardId, setBoardId] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const boardProject = projects.find(p => p.id === boardId) ?? projects.find(p => p.id === projectContext?.id) ?? projects[0] ?? null
  const boardKey = boardProject?.id
  const isNoAccess = (err: unknown) => axios.isAxiosError(err) && [403, 404].includes(err.response?.status ?? 0)
  const taskMessage = (err: unknown, fallback: string) =>
    axios.isAxiosError(err) && typeof err.response?.data?.message === 'string' ? err.response.data.message : fallback

  // What the signed-in user may do on this project (decided by the server).
  const { data: access } = useQuery({
    queryKey: ['task-access', boardKey],
    queryFn: () => client.get<{ role: string; canEdit: boolean }>('/api/tasks/access', { params: { projectId: boardKey } }).then(r => r.data),
    enabled: signedIn && page === 'board' && !!boardKey,
    retry: false,
    refetchInterval: 15000,
  })
  const boardReadOnly = access
    ? !access.canEdit
    : !!boardProject && projectContext?.id === boardProject.id && projectContext.role === 'Viewer'

  const { data: tasks = [], isLoading: tasksLoading, isError: tasksError, error: tasksErrObj } = useQuery({
    queryKey: ['tasks', boardKey],
    queryFn: () => client.get<Task[]>('/api/tasks', { params: { projectId: boardKey } }).then(r => r.data),
    enabled: signedIn && page === 'board' && !!boardKey,
    retry: (n, err) => !isNoAccess(err) && n < 3,
    refetchInterval: 10000,
  })
  const tasksErrorMessage = isNoAccess(tasksErrObj)
    ? "You don't have access to this project's board, or the project no longer exists."
    : undefined

  const refreshTasks = () => {
    qc.invalidateQueries({ queryKey: ['tasks', boardKey] })
    qc.invalidateQueries({ queryKey: ['project-dashboard'] })
  }

  const moveTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => client.put(`/api/tasks/${id}/status`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['tasks', boardKey] })
      const prev = qc.getQueryData<Task[]>(['tasks', boardKey])
      qc.setQueryData<Task[]>(['tasks', boardKey], old => old?.map(t => (t.id === id ? { ...t, status } : t)))
      return { prev }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks', boardKey], ctx.prev)
      setToast(taskMessage(err, 'Could not move the task. Try again.'))
    },
    onSettled: refreshTasks,
  })

  const createTask = useMutation({
    mutationFn: (f: TaskForm) =>
      client.post('/api/tasks', {
        projectId: boardKey,
        title: f.title.trim(),
        description: f.description || null,
        assigneeId: f.assigneeId || null,
        priority: f.priority,
        dueDate: f.dueDate || null,
        estimatedHours: f.hours ? Number(f.hours) : null,
      }),
    onSuccess: refreshTasks,
  })

  const assignTask = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) => client.put(`/api/tasks/${id}/assign`, { assigneeId }),
    onSuccess: refreshTasks,
    onError: err => setToast(taskMessage(err, 'Could not assign the task.')),
  })

  const deleteTask = useMutation({
    mutationFn: (id: string) => client.delete(`/api/tasks/${id}`),
    onSuccess: () => { refreshTasks(); setToast('Task deleted.') },
    onError: err => setToast(taskMessage(err, 'Could not delete the task.')),
  })

  const openBoard = (pr: Project) => {
    setBoardId(pr.id)
    setPage('board')
  }

  const enterProjectContext = async (p: Project) => {
    try {
      const { data } = await client.post('/api/auth/project-context', { projectId: p.id })
      setProjectContext({ id: p.id, name: p.name, role: data.projectRole || 'Editor' })
    } catch {
      setProjectContext({ id: p.id, name: p.name, role: 'Editor' })
    }
  }

  const leaveProjectContext = async () => {
    try {
      await client.delete('/api/auth/project-context')
    } catch { /* ignore */ }
    setProjectContext(null)
  }

  const create = useMutation({
    mutationFn: (f: ProjectForm) =>
      client.post('/api/projects', {
        name: f.name,
        description: f.description,
        ownerId: user?.id,
        startDate: f.startDate || null,
        targetEndDate: f.targetEndDate || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['admin-metrics'] })
      closeDialog()
    },
  })

  const update = useMutation({
    mutationFn: ({ id, f }: { id: string; f: ProjectForm }) =>
      client.put(`/api/projects/${id}`, {
        name: f.name,
        description: f.description,
        status: f.status,
        startDate: f.startDate || null,
        targetEndDate: f.targetEndDate || null,
      }).then(() => {
        if (editing && f.status !== editing.status)
          return client.put(`/api/projects/${id}/status`, { status: f.status, reason: f.statusReason })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['admin-metrics'] })
      closeDialog()
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => client.delete(`/api/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['admin-metrics'] })
    },
  })

  const restore = useMutation({
    mutationFn: (id: string) => client.post(`/api/projects/${id}/restore`),
    onSuccess: () => {
      setToast('Project restored.')
      // Refresh every list that shows this project, so the restored row leaves the deleted list at once.
      qc.invalidateQueries({ queryKey: ['admin-deleted-projects'] })
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] })
      qc.invalidateQueries({ queryKey: ['admin-metrics'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: err => {
      setToast(axios.isAxiosError(err) && err.response?.data?.message ? String(err.response.data.message) : 'Could not restore the project.')
    },
  })

  const purge = useMutation({
    mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) =>
      client.delete(`/api/admin/deleted-projects/${id}`, { data: { confirmName } }),
    onSuccess: () => {
      setToast('Project permanently deleted.')
      qc.invalidateQueries({ queryKey: ['admin-deleted-projects'] })
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] })
    },
    onError: err => {
      setToast(axios.isAxiosError(err) && err.response?.data?.message ? String(err.response.data.message) : 'Could not delete the project.')
    },
  })

  const invite = useMutation({
    mutationFn: () => client.post(`/api/projects/${collabProject!.id}/collaborators`, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collaborators', collabProject?.id] })
      setInviteEmail('')
    },
  })

  const refreshCollaborators = () => {
    qc.invalidateQueries({ queryKey: ['collaborators', collabProject?.id] })
    qc.invalidateQueries({ queryKey: ['projects'] })
  }
  const changeCollabRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      client.put(`/api/projects/${collabProject!.id}/collaborators/${userId}`, { role }),
    onSuccess: refreshCollaborators,
  })
  const removeCollab = useMutation({
    mutationFn: (userId: string) => client.delete(`/api/projects/${collabProject!.id}/collaborators/${userId}`),
    onSuccess: (_d, userId) => {
      refreshCollaborators()
      if (userId === user?.id) setCollabProject(null) // you left: this project is no longer yours to manage
    },
  })
  const collabActionError = (() => {
    const err = changeCollabRole.error ?? removeCollab.error
    if (!err) return null
    return axios.isAxiosError(err) && err.response?.data?.message ? String(err.response.data.message) : 'That change could not be saved.'
  })()

  const confirmDelete = () => {
    if (!pendingDelete) return
    const p = pendingDelete
    setPendingDelete(null)
    setUndo(p)
    if (editing?.id === p.id) closeDialog()
    remove.mutate(p.id)
  }

  const undoDelete = () => {
    if (!undo) return
    restore.mutate(undo.id)
    setUndo(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
        return
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        setPage('projects')
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = projects.filter(p =>
      (filter === 'All' || p.status === filter) &&
      (!q || p.name.toLowerCase().includes(q) || p.owner.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)) &&
      (ownerFilter === 'all' || p.ownerId === user?.id),
    )
    const start = (p: Project) => (p.startDate ? Date.parse(p.startDate) : Infinity)
    const byName = (a: Project, b: Project) => a.name.localeCompare(b.name)
    const compare: Record<SortKey, (a: Project, b: Project) => number> = {
      seq: (a, b) => (a.seqNo ?? 0) - (b.seqNo ?? 0) || byName(a, b),
      name: byName,
      status: (a, b) => rank(a.status) - rank(b.status) || byName(a, b),
      start: (a, b) => start(a) - start(b) || byName(a, b),
    }
    return [...list].sort(compare[sort])
  }, [projects, filter, query, sort])

  const alerts = useMemo(() => {
    const out: { key: string; project: Project; note: string; tone: 'late' | 'soon' | 'stalled' }[] = []
    for (const p of projects) {
      const d = dueInfo(p)
      if (d) out.push({ key: p.id + 'due', project: p, note: d.label, tone: d.tone })
      if (p.status === 'Stalled') out.push({ key: p.id + 'st', project: p, note: 'Stalled', tone: 'stalled' })
    }
    const w = { late: 0, soon: 1, stalled: 2 }
    return out.sort((a, b) => w[a.tone] - w[b.tone]).slice(0, 12)
  }, [projects])

  const count = (s: string) => projects.filter(p => p.status === s).length
  const dateError = !!form.startDate && !!form.targetEndDate && form.targetEndDate < form.startDate
  const stats: { label: string; value: number; filter: Filter }[] = [
    { label: 'Total', value: projects.length, filter: 'All' },
    { label: 'Active', value: count('Active'), filter: 'Active' },
    { label: 'Completed', value: count('Completed'), filter: 'Completed' },
    { label: 'Stalled', value: count('Stalled'), filter: 'Stalled' },
  ]

  const closeDialog = () => {
    setDialog(null)
    setEditing(null)
    setForm(emptyForm)
  }
  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialog('create')
    setPage('projects')
  }
  const openEdit = (p: Project) => {
    setEditing(p)
    setForm(formFromProject(p))
    setDialog('edit')
  }
  const openView = (p: Project) => {
    setEditing(p)
    setForm(formFromProject(p))
    setDialog('view')
  }
  const openCollab = (p: Project) => {
    setCollabProject(p)
    setPage('collaborators')
  }

  const applyProfileTheme = (t?: string | null) => {
    if (t && ['Light','Dark','System'].includes(t)) {
      const p = t as ThemePref; setThemePref(p); setMode(resolvedMode(p)); localStorage.setItem(THEME_KEY, p)
    }
  }

  const logout = () => {
    // Leave straight away; never make the user wait for the server. The server is told in the
    // background so the session is revoked. The token is sent explicitly because it is removed just below.
    const token = loadSession()?.token
    if (token) {
      client
        .post('/api/auth/logout', null, { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 })
        .catch(() => { /* the session also expires on its own */ })
    }
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
    closeDialog()
    setQuery('')
    setPage('dashboard')
  }

  const saving = create.isPending || update.isPending
  const saveError = create.isError || update.isError
  const subtitles: Record<Page, string> = {
    dashboard: `Welcome back, ${user?.fullName ?? 'User'}. Plan, prioritize, and track your projects.`,
    admin: 'Workspace metrics, audit trail, and accounts.',
    projects: 'Create, view, edit, or delete projects.',
    board: 'Drag tasks across columns to update their progress.',
    users: 'Name, email, and authentication code for each account.',
      collaborators: 'Invite people who already have an account.',
      analytics: 'Project analytics and charts.',
  }
  const titles: Record<Page, string> = {
    dashboard: 'Dashboard',
    admin: 'Admin',
    projects: 'Projects',
    board: 'Task board',
    users: 'Users',
      collaborators: 'Collaborators',
      analytics: 'Project analytics and charts.',
  }

  return (
    <ApolloProvider client={apolloClient}>
    <StyledEngineProvider injectFirst>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="griot-root">
        {!signedIn ? (
          <LoginPage muted={muted} onSignedIn={s => { setSession(s); setPage('dashboard'); applyProfileTheme(s.user?.themePreference) }} />
        ) : (
          <div className="app-shell">
            <aside className="side" aria-label="Sidebar">
              <div className="brand">
                <svg className="brand-mark" width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="var(--accent)" strokeWidth="4" />
                  <path d="M12 21l5.5 5.5L28 14" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <div className="brand-name">Project Hub</div>
                  <div className="brand-sub">GTP 2026 · Sababisha Solutions</div>
                </div>
              </div>

              <div className="side-label">Menu</div>
              <nav className="dash-nav" aria-label="Main">
                <button type="button" className="nav-btn" aria-current={page === 'dashboard' ? 'page' : undefined} onClick={() => setPage('dashboard')}>
                  <DashboardOutlinedIcon fontSize="small" /> <span className="nav-text">Dashboard</span>
                </button>
                <button type="button" className="nav-btn" aria-current={page === 'projects' ? 'page' : undefined} onClick={() => setPage('projects')}>
                  <FolderOutlinedIcon fontSize="small" /> <span className="nav-text">Projects</span>
                </button>
                <button type="button" className="nav-btn" aria-current={page === 'board' ? 'page' : undefined} onClick={() => setPage('board')}>
                  <ViewKanbanOutlinedIcon fontSize="small" /> <span className="nav-text">Board</span>
                </button>
                <button type="button" className="nav-btn" aria-current={page === 'analytics' ? 'page' : undefined} onClick={() => setPage('analytics')}>
                  <BarChartIcon fontSize="small" /> <span className="nav-text">Analytics</span>
                </button>
                <button type="button" className="nav-btn" aria-current={page === 'users' ? 'page' : undefined} onClick={() => setPage('users')}>
                  <PeopleOutlinedIcon fontSize="small" /> <span className="nav-text">Users</span>
                </button>
                <button type="button" className="nav-btn" aria-current={page === 'collaborators' ? 'page' : undefined} onClick={() => setPage('collaborators')}>
                  <GroupAddOutlinedIcon fontSize="small" /> <span className="nav-text">Collaborators</span>
                </button>
              </nav>

              <div className="side-label">General</div>
              <nav className="dash-nav" aria-label="General">
                <button type="button" className="nav-btn is-danger" onClick={logout}>
                  <LogoutIcon fontSize="small" /> <span className="nav-text">Logout</span>
                </button>
              </nav>

              <div className="side-spacer" />

              <div className="side-card">
                <div className="side-card-title">Appearance</div>
                <div className="side-card-sub">Choose how Project Hub looks.</div>
                <div className="seg" role="group" aria-label="Appearance">
                  {(['Light', 'Dark', 'System'] as ThemePref[]).map(t => (
                    <button key={t} type="button" aria-pressed={themePref === t} onClick={() => changeTheme(t)}>{t}</button>
                  ))}
                </div>
              </div>

              {admin && (
                <nav className="dash-nav side-admin" aria-label="Administration">
                  <button type="button" className="nav-btn" aria-current={page === 'admin' ? 'page' : undefined} onClick={() => setPage('admin')}>
                    <AdminPanelSettingsIcon fontSize="small" /> <span className="nav-text">Admin</span>
                  </button>
                </nav>
              )}
            </aside>

            <div className="dash-main">
              <header className="dash-topbar">
                <label className="search-pill">
                  <SearchIcon fontSize="small" />
                  <input
                    ref={searchRef}
                    value={query}
                    placeholder="Search projects"
                    aria-label="Search projects"
                    onChange={e => { setQuery(e.target.value); setPage('projects') }}
                  />
                  <span className="kbd" aria-hidden="true">/</span>
                  <button type="button" className="kbd kbd-btn" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">Ctrl K</button>
                </label>
                <div className="who">
                  <button type="button" className="icon-btn" aria-label={`Notifications (${alerts.length})`} onClick={e => setBellEl(e.currentTarget)}>
                    <Badge badgeContent={alerts.length} color="error" max={9}>
                      <NotificationsNoneOutlinedIcon fontSize="small" />
                    </Badge>
                  </button>
                  <button type="button" className="who-btn" aria-haspopup="menu" aria-label="Account menu" onClick={e => setMenuEl(e.currentTarget)}>
                    <span className="who-text">
                      <span className="who-name">{user?.fullName ?? 'User'}</span>
                      <span className="who-mail">{user?.email}{admin ? ' · Admin' : ''}</span>
                    </span>
                    <span className="avatar" aria-hidden="true">{initials(user?.fullName ?? 'U')}</span>
                  </button>
                </div>
              </header>

              <Menu anchorEl={bellEl} open={!!bellEl} onClose={() => setBellEl(null)} slotProps={{ paper: { sx: { width: 360, maxWidth: '92vw' } } }}>
                <div className="menu-head">Notifications</div>
                {alerts.length === 0 && <div className="menu-empty">You're all caught up. Nothing is overdue or stalled.</div>}
                {alerts.map(a => (
                  <MenuItem key={a.key} onClick={() => { setBellEl(null); openView(a.project) }} sx={{ gap: 1.5, whiteSpace: 'normal' }}>
                    <span className={`dot s-${statusKey(a.project.status)}`}>{(a.project.name[0] ?? '?').toUpperCase()}</span>
                    <span className="plist-body" style={{ flex: 1 }}>
                      <span className="plist-name" style={{ display: 'block' }}>{a.project.name}</span>
                      <span className="plist-due">{a.project.targetEndDate ? `Ends ${fmt(a.project.targetEndDate)}` : 'No end date'}</span>
                    </span>
                    <span className={`pill ${a.tone === 'stalled' ? 's-stalled' : `due-${a.tone}`}`}>{a.note}</span>
                  </MenuItem>
                ))}
              </Menu>

              <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
                <div className="menu-head">
                  <div className="who-name">{user?.fullName ?? 'User'}</div>
                  <div className="who-mail">{user?.email}</div>
                </div>
                <Divider />
                <div className="menu-label">Appearance</div>
                {(['Light', 'Dark', 'System'] as ThemePref[]).map(t => (
                  <MenuItem key={t} selected={themePref === t} onClick={() => { changeTheme(t); setMenuEl(null) }}>{t}</MenuItem>
                ))}
                <Divider />
                <MenuItem onClick={() => { setMenuEl(null); logout() }}>Logout</MenuItem>
              </Menu>

              <main className="griot-content dash-content">
                <div className="page-head">
                  <div>
                    <h1>{titles[page]}</h1>
                    <p>{subtitles[page]}</p>
                  </div>
                  <div className="page-actions">
                    {page === 'projects' && (
                      <button type="button" className="btn btn-primary" onClick={openCreate}><AddIcon fontSize="small" /> New project</button>
                    )}
                    {page === 'dashboard' && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={openCreate}><AddIcon fontSize="small" /> Add project</button>
                        <button type="button" className="btn btn-outline" onClick={() => setPage('projects')}>View all</button>
                      </>
                    )}
                  </div>
                </div>

                {page === 'dashboard' && (
                  <DashboardPage
                    projects={projects}
                    users={users}
                    isLoading={isLoading}
                    usersLoading={usersLoading}
                    projectContext={projectContext}
                    onLeaveContext={leaveProjectContext}
                    onCreate={openCreate}
                    onOpenProjects={(f: Filter) => { setFilter(f); setPage('projects') }}
                    onOpenTeam={() => setPage('collaborators')}
                    onView={openView}
                  />
                )}
                {page === 'board' && (
                  <BoardPage
                    projects={projects}
                    selected={boardProject}
                    onSelect={pr => setBoardId(pr.id)}
                    users={users}
                    tasks={tasks}
                    isLoading={isLoading || tasksLoading}
                    isError={tasksError}
                    errorMessage={tasksErrorMessage}
                    readOnly={boardReadOnly}
                    meName={user?.fullName ?? ''}
                    onMove={(t, status) => moveTask.mutate({ id: t.id, status })}
                    onCreate={f => createTask.mutateAsync(f)}
                    onAssign={(t, assigneeId) => assignTask.mutate({ id: t.id, assigneeId })}
                    onDelete={t => deleteTask.mutate(t.id)}
                  />
                )}
                {page === 'admin' && admin && (
                  <AdminPage
                    muted={muted}
                    metrics={metrics}
                    fallback={{
                      usersCount: users.length,
                      projectsCreatedCount: projects.length,
                      projectsCompletedCount: count('Completed'),
                      projectsStalledCount: count('Stalled'),
                    }}
                    onUsers={() => setPage('users')}
                    onProjects={(f: Filter) => { setFilter(f); setPage('projects') }}
                    users={users}
                    usersLoading={usersLoading}
                    usersError={usersError}
                    auditLogs={auditLogs}
                    auditLoading={auditLoading}
                    deletedProjects={deletedProjects}
                    onRestore={(id) => restore.mutate(id)}
                    onPurge={(id, confirmName) => purge.mutate({ id, confirmName })}
                  />
                )}
                {page === 'projects' && (
                  <ProjectsPage
                    muted={muted}
                    isLoading={isLoading}
                    isError={isError}
                    saveError={remove.isError || update.isError}
                    stats={stats}
                    filter={filter}
                    ownerFilter={ownerFilter}
                    setOwnerFilter={setOwnerFilter}
                    setFilter={setFilter}
                    query={query}
                    sort={sort}
                    setSort={setSort}
                    visible={visible}
                    onView={openView}
                    onEdit={openEdit}
                    onDelete={setPendingDelete}
                    onCollab={openCollab}
                    onBoard={openBoard}
                    onEnterContext={enterProjectContext}
                    projectContext={projectContext}
                  />
                )}
                {page === 'analytics' && (
                  <AnalyticsPage muted={muted} />
                )}
                {page === 'users' && (
                  <UsersPage
                    users={users} isLoading={usersLoading} isError={usersError} muted={muted}
                    meId={user?.id ?? ''} isAdmin={admin}
                    onToggleActive={u => {
                      const url = u.isActive ? `/api/users/${u.id}/deactivate` : `/api/users/${u.id}/reactivate`
                      client.post(url, {}).then(() => qc.invalidateQueries({ queryKey: ['users'] }))
                        .catch(err => setToast(axios.isAxiosError(err) && err.response?.data?.message ? String(err.response.data.message) : 'Could not update account.'))
                    }}
                    onChangeRole={(u, role) => {
                      client.put(`/api/users/${u.id}`, { fullName: u.fullName, email: u.email, role })
                        .then(() => qc.invalidateQueries({ queryKey: ['users'] }))
                        .catch(err => setToast(axios.isAxiosError(err) && err.response?.data?.message ? String(err.response.data.message) : 'Could not change role.'))
                    }}
                  />
                )}
                {page === 'collaborators' && (
                  <CollaboratorPage
                    muted={muted}
                    projects={projects}
                    selected={collabProject}
                    setSelected={setCollabProject}
                    collaborators={collaborators}
                    loading={collabLoading}
                    inviteEmail={inviteEmail}
                    setInviteEmail={setInviteEmail}
                    inviteRole={inviteRole}
                    setInviteRole={setInviteRole}
                    onInvite={() => invite.mutate()}
                    inviteError={invite.isError}
                    inviting={invite.isPending}
                    meId={user?.id ?? ''}
                    isAdmin={admin}
                    busy={changeCollabRole.isPending || removeCollab.isPending}
                    actionError={collabActionError}
                    onChangeRole={(userId, role) => { removeCollab.reset(); changeCollabRole.mutate({ userId, role }) }}
                    onRemove={userId => { changeCollabRole.reset(); removeCollab.mutate(userId) }}
                  />
                )}
              </main>
            </div>
          </div>
        )}

        <Snackbar
          open={!!toast}
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          message={toast ?? ''}
        />

        {signedIn && paletteOpen && (
          <CommandPalette
            open
            onClose={() => setPaletteOpen(false)}
            projects={projects}
            admin={admin}
            onGo={setPage}
            onView={openView}
            onCreate={openCreate}
            onTheme={changeTheme}
          />
        )}

        <Snackbar
          open={!!undo}
          autoHideDuration={UNDO_MS}
          onClose={(_e, reason) => { if (reason !== 'clickaway') setUndo(null) }}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          message={undo ? `Deleted "${undo.name}". Restorable for 30 days.` : ''}
          action={<Button color="primary" size="small" onClick={undoDelete}>Undo</Button>}
        />

        <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Delete {pendingDelete?.name}?</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: muted }}>
              This hides the project from lists (soft delete). It can be restored for 30 days. Permanent purge is admin-only after that window.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={confirmDelete}>Delete project</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={dialog === 'create' || dialog === 'edit'} onClose={closeDialog} maxWidth="sm" fullWidth>
          <DialogTitle>{dialog === 'edit' ? 'Edit Project' : 'Create New Project'}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Project Name" required fullWidth autoFocus sx={{ mt: 1 }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <TextField label="Description" multiline rows={3} fullWidth value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Box className="date-row">
              <TextField label="Start Date" type="date" fullWidth slotProps={{ inputLabel: { shrink: true } }} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              <TextField
                label="End Date" type="date" fullWidth error={dateError}
                helperText={dateError ? "The end date can't be before the start date." : undefined}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: form.startDate || undefined } }}
                value={form.targetEndDate} onChange={e => setForm(f => ({ ...f, targetEndDate: e.target.value }))}
              />
            </Box>
            {dialog === 'edit' && (
              <Box className="glass" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Action Status</Typography>
                <TextField select label="Status" fullWidth value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} sx={{ mb: 2 }}>
                  {STATUSES.map(s => <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>)}
                </TextField>
                <TextField label="Reason" fullWidth value={form.statusReason} onChange={e => setForm(f => ({ ...f, statusReason: e.target.value }))} helperText="Required when deactivating or changing status." />
                <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                  {form.status !== 'Inactive' && (
                    <Button size="small" variant="outlined" onClick={() => setForm(f => ({ ...f, status: 'Inactive' }))}>Deactivate</Button>
                  )}
                  {form.status === 'Inactive' && (
                    <Button size="small" variant="outlined" onClick={() => setForm(f => ({ ...f, status: 'Active' }))}>Reactivate</Button>
                  )}
                </Box>
              </Box>
            )}
            {saveError && (
              <Alert severity="error">{dialog === 'edit' ? 'Failed to update project.' : 'Failed to create project. Sign in and try again.'}</Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!form.name || dateError || saving || (dialog === 'edit' && form.status !== editing?.status && !form.statusReason)}
              onClick={() => {
                if (dialog === 'edit' && editing) update.mutate({ id: editing.id, f: form })
                else create.mutate(form)
              }}
            >
              {saving ? 'Saving...' : dialog === 'edit' ? 'Save changes' : 'Create Project'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={dialog === 'view'} onClose={closeDialog} maxWidth="sm" fullWidth>
          <DialogTitle>View Project</DialogTitle>
          <DialogContent>
            {editing && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                <Typography variant="overline">#{editing.seqNo ?? '—'}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{editing.name}</Typography>
                <span style={{ alignSelf: 'flex-start' }}><StatusPill status={editing.status} /></span>
                <Typography sx={{ color: muted }}>{editing.description || 'No description provided.'}</Typography>
                <Typography variant="body2">Created by: {editing.owner}</Typography>
                <div className="date-row">
                  <Typography variant="body2">Start: {editing.startDate ? fmt(editing.startDate) : '—'}</Typography>
                  <Typography variant="body2">End: {editing.targetEndDate ? fmt(editing.targetEndDate) : '—'}</Typography>
                </div>
                {dashLoading && <Typography variant="body2" sx={{ color: muted }}>Loading dashboard…</Typography>}
                {dashboard && (
                  <div className="griot-stats" style={{ marginTop: 8 }}>
                    <div className="glass stat-card" style={{ cursor: 'default' }}>
                      <Typography variant="body2" sx={{ color: muted }}>Tasks</Typography>
                      <Typography variant="h5">{dashboard.totalTasks}</Typography>
                    </div>
                    <div className="glass stat-card" style={{ cursor: 'default' }}>
                      <Typography variant="body2" sx={{ color: muted }}>Done</Typography>
                      <Typography variant="h5">{dashboard.doneTasks}</Typography>
                    </div>
                    <div className="glass stat-card" style={{ cursor: 'default' }}>
                      <Typography variant="body2" sx={{ color: muted }}>Complete</Typography>
                      <Typography variant="h5">{dashboard.completionPercent ?? 0}%</Typography>
                    </div>
                  </div>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeDialog}>Close</Button>
            {editing && (
              <>
                <Button startIcon={<ViewKanbanOutlinedIcon />} onClick={() => { openBoard(editing); closeDialog() }}>Board</Button>
                <Button startIcon={<GroupAddOutlinedIcon />} onClick={() => { openCollab(editing); closeDialog() }}>Collaborators</Button>
                <Button startIcon={<EditOutlinedIcon />} onClick={() => openEdit(editing)}>Edit</Button>
                <Button color="error" startIcon={<DeleteOutlinedIcon />} onClick={() => setPendingDelete(editing)}>Delete</Button>
              </>
            )}
          </DialogActions>
        </Dialog>
      </div>
    </ThemeProvider>
    </StyledEngineProvider>
    </ApolloProvider>
  )
}

type Task = {
  id: string
  projectId: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  estimatedHours: number | null
  assignee: string | null
}
type TaskForm = { title: string; description: string; priority: string; dueDate: string; hours: string; assigneeId: string }
const emptyTask: TaskForm = { title: '', description: '', priority: 'Medium', dueDate: '', hours: '', assigneeId: '' }

const COLS = [
  { key: 'Todo', label: 'To do' },
  { key: 'InProgress', label: 'In progress' },
  { key: 'Done', label: 'Done' },
] as const
type ColKey = (typeof COLS)[number]['key']
const colOf = (s: string): ColKey => (/^(done|completed)$/i.test(s) ? 'Done' : /^in\s?progress$/i.test(s) ? 'InProgress' : 'Todo')
const PRIO_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

function BoardPage({ projects, selected, onSelect, users, tasks, isLoading, isError, errorMessage, readOnly, meName, onMove, onCreate, onAssign, onDelete }: {
  projects: Project[]
  selected: Project | null
  onSelect: (p: Project) => void
  users: User[]
  tasks: Task[]
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  readOnly: boolean
  meName: string
  onMove: (t: Task, status: ColKey) => void
  onCreate: (f: TaskForm) => Promise<unknown>
  onAssign: (t: Task, assigneeId: string | null) => void
  onDelete: (t: Task) => void
}) {
  const [onlyMine, setOnlyMine] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<ColKey | null>(null)
  const [menu, setMenu] = useState<{ el: HTMLElement; task: Task } | null>(null)
  const [toDelete, setToDelete] = useState<Task | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<TaskForm>(emptyTask)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const shown = onlyMine ? tasks.filter(t => t.assignee === meName) : tasks
  const inCol = (c: ColKey) =>
    shown
      .filter(t => colOf(t.status) === c)
      .sort((a, b) =>
        (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1) ||
        (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity) ||
        a.title.localeCompare(b.title))
  const done = tasks.filter(t => colOf(t.status) === 'Done').length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  const submit = async () => {
    setSaving(true)
    setFormError(null)
    try {
      await onCreate(form)
      setAdding(false)
      setForm(emptyTask)
    } catch (err) {
      setFormError(axios.isAxiosError(err) && err.response?.data?.message ? err.response.data.message : 'Could not create the task. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const drop = (c: ColKey) => {
    const t = tasks.find(x => x.id === dragId)
    setDragId(null)
    setOverCol(null)
    if (t && colOf(t.status) !== c) onMove(t, c)
  }

  if (!selected) {
    return <div className="card"><p className="empty-note">Create a project first, then add tasks to its board.</p></div>
  }

  return (
    <>
      <div className="card board-bar">
        <TextField
          select size="small" label="Project" value={selected.id} sx={{ minWidth: 260, flex: '0 1 320px' }}
          onChange={e => { const p = projects.find(x => x.id === e.target.value); if (p) onSelect(p) }}
        >
          {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.seqNo ? `#${p.seqNo} ` : ''}{p.name}</MenuItem>)}
        </TextField>
        <div className="meter-wrap" aria-label={`${done} of ${tasks.length} tasks done`}>
          <div className="meter"><span style={{ width: `${pct}%` }} /></div>
          <span className="meter-txt">{done}/{tasks.length} done · {pct}%</span>
        </div>
        <button type="button" className={`chip-btn${onlyMine ? ' is-on' : ''}`} aria-pressed={onlyMine} onClick={() => setOnlyMine(v => !v)}>Only mine</button>
        {!readOnly && !isError && (
          <button type="button" className="btn btn-primary" onClick={() => { setForm(emptyTask); setFormError(null); setAdding(true) }}>
            <AddIcon fontSize="small" /> Add task
          </button>
        )}
      </div>

      {readOnly && <Alert severity="info" sx={{ mb: 2 }}>You have view-only access to this project, so tasks can't be changed.</Alert>}
      {isError && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage ?? 'Could not load tasks. Check that the API is running.'}</Alert>}

      <div className="board">
        {COLS.map(col => {
          const list = inCol(col.key)
          return (
            <section
              key={col.key}
              className={`col col-${col.key}${overCol === col.key ? ' is-over' : ''}`}
              aria-label={col.label}
              onDragOver={e => { if (dragId && !readOnly) { e.preventDefault(); setOverCol(col.key) } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null) }}
              onDrop={e => { e.preventDefault(); drop(col.key) }}
            >
              <h2 className="col-head"><i className="col-dot" />{col.label}<span className="col-count">{list.length}</span></h2>
              <div className="col-body">
                {isLoading && list.length === 0 && <Skeleton variant="rounded" height={84} />}
                {list.map(t => {
                  const c = colOf(t.status)
                  const idx = COLS.findIndex(x => x.key === c)
                  const due = dueLabel(t.dueDate, c === 'Done')
                  return (
                    <article
                      key={t.id}
                      className={`task${dragId === t.id ? ' is-dragging' : ''}${c === 'Done' ? ' is-done' : ''}`}
                      draggable={!readOnly}
                      onDragStart={e => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id) }}
                      onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    >
                      <div className="task-top">
                        <span className={`pill prio-${(t.priority || 'Medium').toLowerCase()}`}>{t.priority || 'Medium'}</span>
                        {!readOnly && (
                          <span className="task-actions">
                            <span className="task-move">
                              <IconButton size="small" disabled={idx === 0} aria-label={`Move ${t.title} to ${COLS[idx - 1]?.label ?? ''}`} onClick={() => onMove(t, COLS[idx - 1].key)}>
                                <ChevronLeftIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" disabled={idx === COLS.length - 1} aria-label={`Move ${t.title} to ${COLS[idx + 1]?.label ?? ''}`} onClick={() => onMove(t, COLS[idx + 1].key)}>
                                <ChevronRightIcon fontSize="small" />
                              </IconButton>
                            </span>
                            <IconButton size="small" aria-label={`Options for ${t.title}`} onClick={e => setMenu({ el: e.currentTarget, task: t })}>
                              <MoreHorizIcon fontSize="small" />
                            </IconButton>
                          </span>
                        )}
                      </div>
                      <div className="task-title">{t.title}</div>
                      <div className="task-meta">
                        {t.dueDate && <span className="task-due">{fmt(t.dueDate)}</span>}
                        {due && <span className={`pill due-${due.tone}`}>{due.label}</span>}
                        {t.estimatedHours != null && <span className="task-due">{t.estimatedHours}h</span>}
                        <span className="task-spacer" />
                        {t.assignee && (
                          <Tooltip title={t.assignee}><span className="avatar xs">{initials(t.assignee)}</span></Tooltip>
                        )}
                      </div>
                    </article>
                  )
                })}
                {!isLoading && list.length === 0 && (
                  <div className="col-empty">{onlyMine ? 'None of your tasks here.' : readOnly ? 'No tasks.' : 'Drop tasks here'}</div>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { minWidth: 220, maxHeight: 420 } } }}>
        <div className="menu-label">Assign to</div>
        <MenuItem selected={!menu?.task.assignee} onClick={() => { if (menu) onAssign(menu.task, null); setMenu(null) }}>Unassigned</MenuItem>
        {users.map(u => (
          <MenuItem key={u.id} selected={menu?.task.assignee === u.fullName} onClick={() => { if (menu) onAssign(menu.task, u.id); setMenu(null) }}>{u.fullName}</MenuItem>
        ))}
        <Divider />
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { if (menu) setToDelete(menu.task); setMenu(null) }}>
          <DeleteOutlinedIcon fontSize="small" sx={{ mr: 1 }} /> Delete task
        </MenuItem>
      </Menu>

      <Dialog open={!!toDelete} onClose={() => setToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this task?</DialogTitle>
        <DialogContent><Typography sx={{ color: 'var(--muted)' }}>"{toDelete?.title}" will be removed from the board permanently.</Typography></DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { if (toDelete) onDelete(toDelete); setToDelete(null) }}>Delete task</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adding} onClose={() => setAdding(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add task to {selected.name}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Task title" required autoFocus fullWidth sx={{ mt: 1 }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <TextField label="Description" multiline rows={3} fullWidth value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', '& > *': { flex: '1 1 200px' } }}>
            <TextField select label="Priority" fullWidth value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              {['Low', 'Medium', 'High'].map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <TextField label="Due date" type="date" fullWidth slotProps={{ inputLabel: { shrink: true } }} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', '& > *': { flex: '1 1 200px' } }}>
            <TextField label="Estimated hours" type="number" fullWidth slotProps={{ htmlInput: { min: 0, step: 0.5 } }} value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} />
            <TextField select label="Assignee" fullWidth value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
              <MenuItem value="">Unassigned</MenuItem>
              {users.map(u => <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>)}
            </TextField>
          </Box>
          {formError && <Alert severity="error">{formError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.title.trim() || saving} onClick={submit}>{saving ? 'Saving...' : 'Add task'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

type Cmd = { id: string; label: string; hint: string; run: () => void }

function CommandPalette({ open, onClose, projects, admin, onGo, onView, onCreate, onTheme }: {
  open: boolean
  onClose: () => void
  projects: Project[]
  admin: boolean
  onGo: (p: Page) => void
  onView: (p: Project) => void
  onCreate: () => void
  onTheme: (t: ThemePref) => void
}) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)

  const items = useMemo<Cmd[]>(() => {
    const page = (id: Page, label: string): Cmd => ({ id: 'p-' + id, label, hint: 'Page', run: () => onGo(id) })
    return [
      { id: 'a-new', label: 'New project', hint: 'Action', run: onCreate },
      page('dashboard', 'Dashboard'),
      page('projects', 'Projects'),
      page('board', 'Task board'),
      page('users', 'Users'),
      page('collaborators', 'Collaborators'),
      ...(admin ? [page('admin', 'Admin')] : []),
      ...projects.map<Cmd>(p => ({ id: 'pr-' + p.id, label: p.name, hint: `Project · ${statusLabel(p.status)}`, run: () => onView(p) })),
      { id: 't-light', label: 'Switch to light theme', hint: 'Action', run: () => onTheme('Light') },
      { id: 't-dark', label: 'Switch to dark theme', hint: 'Action', run: () => onTheme('Dark') },
      { id: 't-system', label: 'Use system theme', hint: 'Action', run: () => onTheme('System') },
    ]
  }, [projects, admin, onGo, onView, onCreate, onTheme])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = t ? items.filter(i => i.label.toLowerCase().includes(t) || i.hint.toLowerCase().includes(t)) : items
    return list.slice(0, 9)
  }, [items, q])

  const choose = (c?: Cmd) => {
    if (!c) return
    onClose()
    c.run()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start', pt: '12vh' } }}
      slotProps={{ paper: { sx: { overflow: 'hidden' } } }}
      aria-label="Command palette"
    >
      <div className="cmd-input">
        <SearchIcon fontSize="small" />
        <input
          autoFocus
          value={q}
          placeholder="Search projects, pages, actions…"
          aria-label="Command palette search"
          onChange={e => { setQ(e.target.value); setIdx(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); choose(results[idx]) }
          }}
        />
        <span className="kbd" aria-hidden="true">Esc</span>
      </div>
      <ul className="cmd-list" role="listbox">
        {results.map((r, i) => (
          <li key={r.id} role="option" aria-selected={i === idx}>
            <button type="button" className={i === idx ? 'is-active' : ''} onMouseEnter={() => setIdx(i)} onClick={() => choose(r)}>
              <span className="cmd-label">{r.label}</span>
              <span className="cmd-hint">{r.hint}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="empty-note" style={{ padding: '14px 18px' }}>No matches for "{q}".</li>}
      </ul>
    </Dialog>
  )
}

function LoginPage({ muted, onSignedIn }: { muted: string; onSignedIn: (s: { token: string; user: SessionUser }) => void }) {
  const [destination, setDestination] = useState('')
  const [fullName, setFullName] = useState('')
  const [otp, setOtp] = useState('')
  const [sent, setSent] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const [consoleReason, setConsoleReason] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  const email = destination.trim()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const requestOtp = async () => {
    setError(null)
    setBusy(true)
    try {
      const { data } = await client.post('/api/auth/request-otp', { destination: email, purpose: 'login' })
      setSent(true)
      setSentTo(email)
      setOtp('')
      setSeconds(60)
      setDevOtp(data.devOtp ?? null)
      setConsoleReason(data.delivery === 'console' ? (data.detail ?? 'unknown error') : null)
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const d = err.response.data
        const base = d?.message ?? 'Could not send the code. Please try again.'
        setError(d?.detail ? `${base} Reason: ${d.detail}` : base)
      } else {
        setError('Could not reach the server. Is the API running on port 5241?')
      }
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setError(null)
    setBusy(true)
    try {
      const { data } = await client.post('/api/auth/verify-otp', { destination: sentTo, otp, fullName })
      const payload = { token: data.token, user: data.user as SessionUser }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload))
      onSignedIn(payload)
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setError(err.response.data.message)
      } else {
        setError('Invalid or expired code. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const changeEmail = () => {
    setSent(false)
    setOtp('')
    setDevOtp(null)
    setConsoleReason(null)
    setError(null)
    setSeconds(0)
  }

  return (
    <main className="griot-content" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="glass" style={{ padding: 40, maxWidth: 440, width: '100%' }}>
        <Typography variant="overline" sx={{ letterSpacing: 3, color: muted }}>GTP 2026 · Sababisha Solutions</Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, my: 2 }}>Sign in</Typography>
        <Typography sx={{ color: muted, mb: 3 }}>
          {sent ? 'Enter the 6-digit code we emailed you.' : "Enter your email and we'll send you a 6-digit sign-in code."}
        </Typography>
        <TextField
          label="Email address" type="email" fullWidth value={destination} disabled={sent}
          autoComplete="email" slotProps={{ htmlInput: { inputMode: 'email' } }}
          onChange={e => setDestination(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !sent && validEmail && !busy) requestOtp() }}
          sx={{ mb: 2 }}
        />
        {sent && (
          <>
            {consoleReason && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                We couldn't email the code ({consoleReason}).
                <br />
                <small>Development mode: the sign-in code was printed in the API console window. Type it below.</small>
              </Alert>
            )}
            {!devOtp && !consoleReason && (
              <Alert severity="success" sx={{ mb: 2 }}>
                We sent a code to <strong>{sentTo}</strong>. It expires in 10 minutes. Can't see it? Check your spam folder.
              </Alert>
            )}
            <TextField label="Your name (first sign-in)" fullWidth value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" sx={{ mb: 2 }} />
            <TextField
              label="6-digit code" fullWidth value={otp} autoFocus autoComplete="one-time-code"
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, pattern: '[0-9]*' } }}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter' && otp.length === 6 && !busy) verify() }}
              sx={{ mb: 2 }}
            />
            {devOtp && (
              <Alert
                severity="info"
                sx={{ mb: 2, display: 'flex', alignItems: 'center' }}
                action={<Button color="inherit" size="small" onClick={() => setOtp(devOtp)}>Fill</Button>}
              >
                Development code: <strong>{devOtp}</strong>
                <br />
                <small>Email isn't configured on the API, so the code is shown here.</small>
              </Alert>
            )}
          </>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!sent ? (
          <Button variant="contained" fullWidth disabled={!validEmail || busy} onClick={requestOtp}>
            {busy ? 'Sending…' : 'Email me a code'}
          </Button>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button variant="contained" disabled={otp.length < 6 || busy} onClick={verify}>{busy ? 'Verifying…' : 'Verify and continue'}</Button>
            <Button disabled={seconds > 0 || busy} onClick={requestOtp}>{seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}</Button>
            <Button color="inherit" size="small" disabled={busy} onClick={changeEmail}>Use a different email</Button>
          </Box>
        )}
        <Typography variant="caption" sx={{ color: muted, display: 'block', mt: 2 }}>
          Limited to 3 code requests per hour per email.
        </Typography>
      </div>
    </main>
  )
}

function DashboardPage({ projects, users, isLoading, usersLoading, projectContext, onLeaveContext, onCreate, onOpenProjects, onOpenTeam, onView }: {
  projects: Project[]
  users: User[]
  isLoading: boolean
  usersLoading: boolean
  projectContext: { id: string; name: string; role: string } | null
  onLeaveContext: () => void
  onCreate: () => void
  onOpenProjects: (f: Filter) => void
  onOpenTeam: () => void
  onView: (p: Project) => void
}) {
  const total = projects.length
  const n = (s: string) => projects.filter(p => p.status === s).length
  const completed = n('Completed')
  const active = n('Active')
  const stalled = n('Stalled')
  const inactive = total - completed - active - stalled
  const pct = total ? Math.round((completed / total) * 100) : 0
  const share = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : '0%')

  const kpis: { label: string; value: number; filter: Filter; chip: string; note: string; featured?: boolean }[] = [
    { label: 'Total projects', value: total, filter: 'All', chip: String(active), note: 'active right now', featured: true },
    { label: 'Completed', value: completed, filter: 'Completed', chip: share(completed), note: 'of all projects' },
    { label: 'Active', value: active, filter: 'Active', chip: share(active), note: 'of all projects' },
    { label: 'Stalled', value: stalled, filter: 'Stalled', chip: share(stalled), note: stalled ? 'need attention' : 'nothing blocked' },
  ]

  // Projects starting per month, last 7 months
  const months = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (6 - i), 1)
      const count = projects.filter(p => {
        if (!p.startDate) return false
        const sd = new Date(p.startDate)
        return sd.getFullYear() === d.getFullYear() && sd.getMonth() === d.getMonth()
      }).length
      return { label: d.toLocaleDateString('en-GB', { month: 'short' }), count }
    })
  }, [projects])
  const maxM = Math.max(...months.map(m => m.count), 0)
  const order = [...months].map((m, i) => ({ i, c: m.count })).sort((a, b) => b.c - a.c)
  const tone = (i: number) => {
    const c = months[i].count
    if (!c) return 0
    const r = order.findIndex(o => o.i === i)
    return r === 0 ? 1 : r === 1 ? 2 : 3
  }

  // Next deadline: nearest upcoming end date among unfinished projects, else most overdue
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const open = projects.filter(p => p.targetEndDate && p.status !== 'Completed')
  const upcoming = open.filter(p => new Date(p.targetEndDate!) >= today).sort((a, b) => Date.parse(a.targetEndDate!) - Date.parse(b.targetEndDate!))
  const overdue = open.filter(p => new Date(p.targetEndDate!) < today).sort((a, b) => Date.parse(a.targetEndDate!) - Date.parse(b.targetEndDate!))
  const next = upcoming[0] ?? overdue[0]
  const nextLate = !!next && new Date(next.targetEndDate!) < today

  const list = [...projects].sort((a, b) => (a.seqNo ?? 0) - (b.seqNo ?? 0)).slice(-5).reverse()

  // Gauge geometry (half circle)
  const R = 90
  const L = Math.PI * R
  const segs: { len: number; stroke: string; filter: Filter; label: string }[] = [
    { len: total ? (completed / total) * L : 0, stroke: 'var(--green-600)', filter: 'Completed', label: 'Completed' },
    { len: total ? (active / total) * L : 0, stroke: 'var(--gauge-active)', filter: 'Active', label: 'Active' },
    { len: total ? (stalled / total) * L : 0, stroke: 'var(--warn)', filter: 'Stalled', label: 'Stalled' },
    { len: total ? (inactive / total) * L : 0, stroke: 'url(#stripes)', filter: 'Inactive', label: 'Inactive' },
  ]
  let acc = 0

  return (
    <div className="dash-grid">
      {kpis.map(k => (
        <button key={k.label} type="button" className={`card kpi${k.featured ? ' is-featured' : ''}`} onClick={() => onOpenProjects(k.filter)} aria-label={`${k.label}: ${k.value}. Open list`}>
          <span className="kpi-label">{k.label}</span>
          <span className="kpi-go" aria-hidden="true"><ArrowOutwardIcon sx={{ fontSize: 18 }} /></span>
          <span className="kpi-value">{isLoading ? '–' : <CountUp value={k.value} />}</span>
          <span className="kpi-foot"><span className="kpi-chip">{isLoading ? '–' : k.chip}</span>{k.note}</span>
        </button>
      ))}

      <section className="card span-2" aria-label="Project analytics">
        <h2 className="card-title">Projects started by month</h2>
        <div className="bars">
          {months.map((m, i) => {
            const t = tone(i)
            const h = m.count && maxM ? 38 + 62 * (m.count / maxM) : 34
            return (
              <div className="bar-col" key={i}>
                <div className="bar-wrap">
                  <div className="bar-box" style={{ height: `${h}%` }}>
                    <span className={`bar-tip${t === 1 ? ' is-top' : ''}`}>{m.count} {m.count === 1 ? 'project' : 'projects'}</span>
                    <div className={`bar tone-${t}`} style={{ animationDelay: `${i * 70}ms` }} />
                  </div>
                </div>
                <span className="bar-lbl">{m.label}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card" aria-label="Next deadline" style={{ display: 'flex', flexDirection: 'column' }}>
        <h2 className="card-title">Next deadline</h2>
        {next ? (
          <>
            <div className="deadline-name">{next.name}</div>
            <div className={`deadline-when${nextLate ? ' is-late' : ''}`}>
              {nextLate ? 'Overdue since ' : 'Due '}{fmt(next.targetEndDate!)}
            </div>
            <div style={{ marginTop: 10 }}><DueBadge p={next} /></div>
            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onView(next)}>Open project</button>
            </div>
          </>
        ) : (
          <>
            <p className="empty-note">No open projects have an end date.</p>
            <div style={{ marginTop: 'auto' }}>
              <button type="button" className="btn btn-outline" onClick={onCreate}>Add project</button>
            </div>
          </>
        )}
      </section>

      <section className="card" aria-label="Projects">
        <h2 className="card-title">
          Projects
          <button type="button" className="btn btn-outline sm" onClick={onCreate}><AddIcon sx={{ fontSize: 16 }} /> New</button>
        </h2>
        {list.length === 0 ? (
          <p className="empty-note">{isLoading ? 'Loading…' : 'No projects yet. Add one to get started.'}</p>
        ) : (
          <ul className="plist">
            {list.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => onView(p)}>
                  <span className={`dot s-${statusKey(p.status)}`}>{(p.name[0] ?? '?').toUpperCase()}</span>
                  <span className="plist-body" style={{ flex: 1 }}>
                    <div className="plist-name">{p.name}</div>
                    <div className="plist-due">{p.targetEndDate ? `Due ${fmt(p.targetEndDate)}` : 'No end date'}</div>
                    {dueInfo(p) && <div style={{ marginTop: 4 }}><DueBadge p={p} /></div>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card span-2" aria-label="Team">
        <h2 className="card-title">
          Team
          <button type="button" className="btn btn-outline sm" onClick={onOpenTeam}><AddIcon sx={{ fontSize: 16 }} /> Add member</button>
        </h2>
        {usersLoading && users.length === 0 ? (
          <Skeleton variant="rounded" height={120} />
        ) : users.length === 0 ? (
          <p className="empty-note">No users yet.</p>
        ) : (
          <ul className="team">
            {users.slice(0, 4).map(u => (
              <li key={u.id}>
                <span className="avatar sm" aria-hidden="true">{initials(u.fullName)}</span>
                <div className="team-body">
                  <div className="team-name">{u.fullName}</div>
                  <div className="team-sub">{u.email}</div>
                </div>
                <span className={`pill ${/admin|manager/i.test(u.role) ? 's-active' : 's-inactive'}`}>{u.role}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-label="Project progress">
        <h2 className="card-title">Project progress</h2>
        <div className="gauge" role="img" aria-label={`${pct}% of projects completed`}>
          <svg viewBox="0 0 220 120">
            <defs>
              <pattern id="stripes" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="var(--stripe-b)" />
                <rect width="2.2" height="7" fill="var(--stripe-a)" />
              </pattern>
            </defs>
            <path d={`M ${110 - R} 110 A ${R} ${R} 0 0 1 ${110 + R} 110`} fill="none" stroke="var(--surface-2)" strokeWidth="26" />
            {segs.map((sg, i) => {
              if (sg.len <= 0) return null
              const start = acc
              acc += sg.len
              const draw = Math.max(sg.len - 3, 1)
              return (
                <path key={i} className="gauge-seg" d={`M ${110 - R} 110 A ${R} ${R} 0 0 1 ${110 + R} 110`} fill="none" stroke={sg.stroke} strokeWidth="26"
                  strokeDasharray={`${draw} ${L * 2}`} strokeDashoffset={-start} style={{ animationDelay: `${i * 120}ms` }}
                  onClick={() => onOpenProjects(sg.filter)}>
                  <title>{`${sg.label}: click to view`}</title>
                </path>
              )
            })}
          </svg>
          <div className="gauge-center">
            <div className="gauge-num"><CountUp value={pct} suffix="%" /></div>
            <div className="gauge-cap">Completed</div>
          </div>
        </div>
        <div className="legend">
          {[
            { cls: 'l-done', label: 'Completed', n: completed, filter: 'Completed' as Filter },
            { cls: 'l-active', label: 'Active', n: active, filter: 'Active' as Filter },
            { cls: 'l-stalled', label: 'Stalled', n: stalled, filter: 'Stalled' as Filter },
            { cls: 'l-hold', label: 'Inactive', n: inactive, filter: 'Inactive' as Filter },
          ].map(l => (
            <button key={l.label} type="button" className="legend-btn" onClick={() => onOpenProjects(l.filter)}>
              <i className={l.cls} />{l.label} <b>{l.n}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="card ctx" aria-label="Project context">
        <div className="ctx-title">Project context</div>
        {projectContext ? (
          <>
            <div>
              <div className="ctx-name">{projectContext.name}</div>
              <div className="ctx-role">Working as {projectContext.role}</div>
            </div>
            <div className="ctx-actions">
              <button type="button" className="btn btn-light sm" onClick={onLeaveContext}>Leave context</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="ctx-name">None selected</div>
              <div className="ctx-role">Enter a project to work in its context.</div>
            </div>
            <div className="ctx-actions">
              <button type="button" className="btn btn-light sm" onClick={() => onOpenProjects('All')}>Choose project</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function AdminPage({
  muted, metrics, fallback, onUsers, onProjects, users, usersLoading, usersError,
  auditLogs, auditLoading, deletedProjects, onRestore, onPurge,
}: {
  muted: string
  metrics?: Metrics
  fallback: Metrics
  onUsers: () => void
  onProjects: (f: Filter) => void
  users: User[]
  usersLoading: boolean
  usersError: boolean
  auditLogs: AuditLogItem[]
  auditLoading: boolean
  deletedProjects: DeletedProjectItem[]
  onRestore: (id: string) => void
  onPurge: (id: string, confirmName: string) => void
}) {
  const m = metrics ?? fallback
  const [purgeTarget, setPurgeTarget] = useState<DeletedProjectItem | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const cards = [
    { label: 'Number of Users', value: m.usersCount, onClick: onUsers },
    { label: 'Number of Projects Created', value: m.projectsCreatedCount, onClick: () => onProjects('All') },
    { label: 'Number of Projects Completed', value: m.projectsCompletedCount, onClick: () => onProjects('Completed') },
    { label: 'Number of Projects Stalled', value: m.projectsStalledCount, onClick: () => onProjects('Stalled') },
  ]
  return (
    <>
      <div className="metrics-row">
        {cards.map(c => (
          <button type="button" key={c.label} className="glass stat-card" onClick={c.onClick}>
            <Typography variant="body2" sx={{ color: muted }}>{c.label}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>{c.value}</Typography>
          </button>
        ))}
      </div>

      {deletedProjects.length > 0 && (
        <div className="glass" style={{ padding: 20, marginBottom: 24 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Soft-Deleted Projects (Retention Window: {deletedProjects[0]?.retentionDays ?? 30} Days)</Typography>
          <Typography variant="body2" sx={{ color: muted, mb: 2 }}>Hidden from normal users. Restore them, or delete them forever now. Anything left here is purged automatically when its window ends.</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Seq No</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Deleted On</TableCell>
                <TableCell>Restore Until</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {deletedProjects.map(dp => (
                <TableRow key={dp.id}>
                  <TableCell>#{dp.seqNo}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{dp.name}</TableCell>
                  <TableCell>{dp.owner}</TableCell>
                  <TableCell>{fmt(dp.deletedAt)}</TableCell>
                  <TableCell>{fmt(dp.restoreUntil)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Button size="small" variant="outlined" onClick={() => onRestore(dp.id)}>Restore</Button>
                    <Button size="small" color="error" variant="outlined" sx={{ ml: 1 }} onClick={() => { setConfirmName(''); setPurgeTarget(dp) }}>Delete forever</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Dialog open={!!purgeTarget} onClose={() => setPurgeTarget(null)} maxWidth="xs" fullWidth>
            <DialogTitle>Delete forever?</DialogTitle>
            <DialogContent>
              <Typography sx={{ color: muted, mb: 2 }}>
                This permanently removes <strong>{purgeTarget?.name}</strong>, with its tasks, members and comments. It can't be undone.
              </Typography>
              <TextField
                fullWidth size="small" autoFocus
                label={`Type "${purgeTarget?.name ?? ''}" to confirm`}
                value={confirmName} onChange={e => setConfirmName(e.target.value)}
              />
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setPurgeTarget(null)}>Cancel</Button>
              <Button
                color="error" variant="contained"
                disabled={!purgeTarget || confirmName.trim() !== purgeTarget.name}
                onClick={() => { if (purgeTarget) onPurge(purgeTarget.id, confirmName.trim()); setPurgeTarget(null) }}
              >
                Delete forever
              </Button>
            </DialogActions>
          </Dialog>
        </div>
      )}

      <div className="glass" style={{ padding: 20, marginBottom: 24 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Recent Activity & Audit Logs</Typography>
        <Typography variant="body2" sx={{ color: muted, mb: 2 }}>System events from user actions, status changes, and authentication.</Typography>
        {auditLoading && <Skeleton variant="rounded" height={60} />}
        {!auditLoading && auditLogs.length === 0 && (
          <Typography variant="body2" sx={{ color: muted, py: 2 }}>No recent activity logged yet.</Typography>
        )}
        {!auditLoading && auditLogs.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Action</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>Details</TableCell>
                <TableCell>Timestamp</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditLogs.slice(0, 10).map(a => (
                <TableRow key={a.id}>
                  <TableCell><Chip size="small" label={a.actionType} variant="outlined" /></TableCell>
                  <TableCell>{a.targetType}</TableCell>
                  <TableCell>{a.details || '—'}</TableCell>
                  <TableCell sx={{ color: muted }}>{new Date(a.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="glass" style={{ padding: 20 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Registered Accounts</Typography>
        {usersError && <Alert severity="error">Could not load users.</Alert>}
        {usersLoading && <Skeleton variant="rounded" height={80} />}
        {!usersLoading && users.map(u => (
          <Box key={u.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: '1px solid var(--border)' }}>
            <div>
              <Typography sx={{ fontWeight: 600 }}>{u.fullName}</Typography>
              <Typography variant="body2" sx={{ color: muted }}>{u.email} · Auth Code: {u.authCodeLast4 ? `••••${u.authCodeLast4}` : '—'}</Typography>
            </div>
            <Chip size="small" label={u.role} color={u.role === 'Admin' ? 'primary' : 'default'} />
          </Box>
        ))}
      </div>
    </>
  )
}

function ProjectsPage({
  muted, isLoading, isError, saveError, stats, filter, setFilter, ownerFilter, setOwnerFilter, query, sort, setSort,
  visible, onView, onEdit, onDelete, onCollab, onBoard, onEnterContext, projectContext,
}: {
  muted: string
  isLoading: boolean
  isError: boolean
  saveError: boolean
  stats: { label: string; value: number; filter: Filter }[]
  filter: Filter
  setFilter: (f: Filter) => void
  query: string
  sort: SortKey
  setSort: (s: SortKey) => void
  ownerFilter: 'all'|'mine'
  setOwnerFilter: (f: 'all'|'mine') => void
  visible: Project[]
  onView: (p: Project) => void
  onEdit: (p: Project) => void
  onDelete: (p: Project) => void
  onCollab: (p: Project) => void
  onBoard: (p: Project) => void
  onEnterContext: (p: Project) => void
  projectContext: { id: string; name: string; role: string } | null
}) {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <div>
          {projectContext && (
            <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 600, mt: 0.5 }}>
              Currently in project context: <strong>{projectContext.name}</strong> ({projectContext.role})
            </Typography>
          )}
        </div>
      </Box>
      <div className="griot-stats" style={{ marginBottom: 24 }}>
        {stats.map(s => (
          <button key={s.label} type="button" className="glass stat-card" aria-pressed={filter === s.filter} onClick={() => setFilter(s.filter)}>
            <Typography variant="body2" sx={{ color: muted }}>{s.label}</Typography>
            <Typography variant="h4" component="span" sx={{ fontWeight: 700, display: 'block' }}>{isLoading ? '–' : s.value}</Typography>
          </button>
        ))}
      </div>
      <div className="glass griot-toolbar">
        <button type="button" className={`kb-chip${ownerFilter === 'mine' ? ' is-on' : ''}`} aria-pressed={ownerFilter === 'mine'} onClick={() => setOwnerFilter(ownerFilter === 'mine' ? 'all' : 'mine')}>Only my projects</button>
        <TextField select size="small" label="Sort by" value={sort} onChange={e => setSort(e.target.value as SortKey)} sx={{ minWidth: 170 }}>
          <MenuItem value="seq">Serial no.</MenuItem>
          <MenuItem value="name">Name (A–Z)</MenuItem>
          <MenuItem value="status">Status</MenuItem>
          <MenuItem value="start">Start date</MenuItem>
        </TextField>
      </div>
      {isError && <Alert severity="error" sx={{ mb: 3 }}>Could not reach the API. Restart the backend on port 5241 after the schema update.</Alert>}
      {saveError && <Alert severity="error" sx={{ mb: 3 }}>Something went wrong updating a project.</Alert>}
      <div className="glass" style={{ overflow: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Seq No</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell>Start Date</TableCell>
              <TableCell>End Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7}><Skeleton variant="rounded" height={48} /></TableCell></TableRow>}
            {visible.map((p, i) => {
              const inContext = projectContext?.id === p.id
              const isViewer = inContext && projectContext?.role === 'Viewer'
              return (
                <TableRow key={p.id} hover selected={inContext}>
                  <TableCell>#{p.seqNo || i + 1}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{p.name}</Typography>
                      {inContext && (
                        <Chip label={projectContext.role} size="small" color="primary" variant="outlined" />
                      )}
                    </Box>
                    {p.description && <Typography variant="body2" sx={{ color: muted, maxWidth: 280 }} noWrap>{p.description}</Typography>}
                  </TableCell>
                  <TableCell>{p.owner}</TableCell>
                  <TableCell>{p.startDate ? fmt(p.startDate) : '—'}</TableCell>
                  <TableCell>{p.targetEndDate ? fmt(p.targetEndDate) : '—'}</TableCell>
                  <TableCell><Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}><StatusPill status={p.status} /><DueBadge p={p} /></Box></TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Project">
                      <IconButton size="small" onClick={() => onView(p)} aria-label={`View ${p.name}`}><VisibilityOutlinedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={inContext ? "Current Active Context" : "Enter Project Context"}>
                      <IconButton size="small" color={inContext ? "primary" : "default"} onClick={() => onEnterContext(p)} aria-label={`Enter context for ${p.name}`}>
                        <LaunchOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={isViewer ? "Viewers cannot edit" : "Edit"}>
                      <span>
                        <IconButton size="small" disabled={isViewer} onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Task board">
                      <IconButton size="small" onClick={() => onBoard(p)} aria-label={`Task board for ${p.name}`}><ViewKanbanOutlinedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Collaborators">
                      <IconButton size="small" onClick={() => onCollab(p)} aria-label={`Collaborators for ${p.name}`}><GroupAddOutlinedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={isViewer ? "Viewers cannot delete" : "Delete"}>
                      <span>
                        <IconButton size="small" disabled={isViewer} onClick={() => onDelete(p)} aria-label={`Delete ${p.name}`}>
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              )
            })}
            {!isLoading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography sx={{ py: 3, textAlign: 'center', color: muted }}>
                    {query || filter !== 'All' ? 'No projects match your search or filter.' : 'No projects yet. Use New Project to create one.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function UsersPage({ users, isLoading, isError, muted, meId, isAdmin, onToggleActive, onChangeRole }: {
  users: User[]; isLoading: boolean; isError: boolean; muted: string
  meId: string; isAdmin: boolean
  onToggleActive: (u: User) => void
  onChangeRole: (u: User, role: string) => void
}) {
  return (
    <>
      {isError && <Alert severity="error" sx={{ mb: 3 }}>Could not load users from the API.</Alert>}
      <div className="glass" style={{ overflow: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Auth Code</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Last login</TableCell>
              {isAdmin && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5}><Skeleton variant="rounded" height={48} /></TableCell></TableRow>}
            {users.map(u => (
              <TableRow key={u.id} hover sx={{ opacity: u.isActive ? 1 : 0.55 }}>
                <TableCell>
                  {u.fullName}{!u.isActive && <Chip size="small" label="Inactive" sx={{ ml: 1, fontSize: 11 }} />}
                </TableCell>
                <TableCell><a className="email-link" href={`mailto:${u.email}`}>{u.email}</a></TableCell>
                <TableCell>{u.authCodeLast4 ? `••••${u.authCodeLast4}` : '—'}</TableCell>
                <TableCell>
                  {isAdmin && u.id !== meId
                    ? <TextField select size="small" value={u.role} onChange={e => onChangeRole(u, e.target.value)} sx={{ minWidth: 100 }}>
                        <MenuItem value="Admin">Admin</MenuItem><MenuItem value="User">User</MenuItem>
                      </TextField>
                    : <Chip size="small" label={u.role} />}
                </TableCell>
                <TableCell>{u.lastLoginAt ? fmt(u.lastLoginAt) : '—'}</TableCell>
                {isAdmin && <TableCell align="right">
                  {u.id !== meId && (
                    <Tooltip title={u.isActive ? 'Deactivate' : 'Reactivate'}>
                      <IconButton size="small" onClick={() => onToggleActive(u)} color={u.isActive ? 'default' : 'primary'}
                        aria-label={u.isActive ? `Deactivate ${u.fullName}` : `Reactivate ${u.fullName}`}>
                        {u.isActive ? <BlockIcon fontSize="small" /> : <CheckCircleOutlineIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>}
              </TableRow>
            ))}
            {!isLoading && users.length === 0 && !isError && (
              <TableRow><TableCell colSpan={isAdmin ? 6 : 5}><Typography sx={{ py: 3, textAlign: 'center', color: muted }}>No users yet.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

// Older databases used "Manager" and "Member"; show them as Owner and Editor.
const displayRole = (r: string) => (r === 'Manager' ? 'Owner' : r === 'Member' ? 'Editor' : r)

function CollaboratorPage({ muted, projects, selected, setSelected, collaborators, loading, inviteEmail, setInviteEmail, inviteRole, setInviteRole, onInvite, inviteError, inviting, meId, isAdmin, busy, actionError, onChangeRole, onRemove }: {
  muted: string
  projects: Project[]
  selected: Project | null
  setSelected: (p: Project | null) => void
  collaborators: Collaborator[]
  loading: boolean
  inviteEmail: string
  setInviteEmail: (v: string) => void
  inviteRole: string
  setInviteRole: (v: string) => void
  onInvite: () => void
  inviteError: boolean
  inviting: boolean
  meId: string
  isAdmin: boolean
  busy: boolean
  actionError: string | null
  onChangeRole: (userId: string, role: string) => void
  onRemove: (userId: string) => void
}) {
  const [target, setTarget] = useState<Collaborator | null>(null)

  // Same rule as the API: owners and admins manage everyone; everybody else can only leave.
  const myRole = displayRole(collaborators.find(c => c.userId === meId)?.role ?? '')
  const canManage = isAdmin || selected?.ownerId === meId || myRole === 'Owner'

  return (
    <>
      <TextField select fullWidth label="Project" value={selected?.id ?? ''} onChange={e => setSelected(projects.find(p => p.id === e.target.value) ?? null)} sx={{ mb: 2, maxWidth: 420 }}>
        {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.seqNo ? `#${p.seqNo} ` : ''}{p.name}</MenuItem>)}
      </TextField>
      {selected && (
        <Box className="glass" sx={{ p: 2, mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" label="Invite by email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} sx={{ flex: '1 1 220px' }} />
          <TextField size="small" select label="Role" value={inviteRole} onChange={e => setInviteRole(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="Owner">Owner</MenuItem>
            <MenuItem value="Editor">Editor</MenuItem>
            <MenuItem value="Viewer">Viewer</MenuItem>
          </TextField>
          <Button variant="contained" disabled={!inviteEmail || inviting} onClick={onInvite}>Invite</Button>
        </Box>
      )}
      {inviteError && <Alert severity="error" sx={{ mb: 2 }}>Invite failed. The email must already exist as a user.</Alert>}
      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
      <div className="glass" style={{ overflow: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5}><Skeleton variant="rounded" height={48} /></TableCell></TableRow>}
            {collaborators.map(c => {
              const isCreator = c.userId === selected?.ownerId   // the project creator always stays an Owner
              const isMe = c.userId === meId
              const canRemove = !isCreator && (canManage || isMe)
              return (
                <TableRow key={c.userId}>
                  <TableCell>{c.fullName}{isMe ? ' (you)' : ''}</TableCell>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>
                    {canManage && !isCreator ? (
                      <TextField
                        select size="small" value={displayRole(c.role)} disabled={busy}
                        onChange={e => onChangeRole(c.userId, e.target.value)}
                        slotProps={{ htmlInput: { 'aria-label': `Role for ${c.fullName}` } }}
                        sx={{ minWidth: 120 }}
                      >
                        <MenuItem value="Owner">Owner</MenuItem>
                        <MenuItem value="Editor">Editor</MenuItem>
                        <MenuItem value="Viewer">Viewer</MenuItem>
                      </TextField>
                    ) : displayRole(c.role)}
                  </TableCell>
                  <TableCell>{c.accepted ? 'Joined' : 'Pending'}</TableCell>
                  <TableCell align="right">
                    {canRemove && (
                      <Tooltip title={isMe ? 'Leave this project' : 'Remove from project'}>
                        <span>
                          <IconButton aria-label={isMe ? 'Leave project' : `Remove ${c.fullName}`} disabled={busy} onClick={() => setTarget(c)}>
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {!loading && selected && collaborators.length === 0 && (
              <TableRow><TableCell colSpan={5}><Typography sx={{ py: 3, textAlign: 'center', color: muted }}>No collaborators yet.</Typography></TableCell></TableRow>
            )}
            {!selected && (
              <TableRow><TableCell colSpan={5}><Typography sx={{ py: 3, textAlign: 'center', color: muted }}>Select a project to manage collaborators.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!target} onClose={() => setTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{target?.userId === meId ? 'Leave this project?' : 'Remove collaborator?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: muted }}>
            {target?.userId === meId
              ? `You will lose access to ${selected?.name ?? 'this project'}.`
              : `${target?.fullName} will lose access to ${selected?.name ?? 'this project'}, and their tasks on it will become unassigned.`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { if (target) onRemove(target.userId); setTarget(null) }}>
            {target?.userId === meId ? 'Leave' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
