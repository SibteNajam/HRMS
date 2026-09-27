# 06 — Frontend Architecture

## The state question, answered

You asked whether to use Redux or RTK Query. The answer is **both, for different
things** — and the split is not a matter of taste.

There are two kinds of state in a React app and confusing them is the single
most common cause of a messy frontend.

| | Server state | Client state |
|---|---|---|
| Lives in | The database | The browser tab |
| Owned by | The backend | This user, this session |
| Can go stale | Yes | No |
| Examples | Employee list, pending leave requests, payslips, dues | Sidebar collapsed, theme, active tab, unsaved form text, modal open |
| Tool | **RTK Query** | **Redux slice** (or `useState`) |

**Rule: if it came from an API call, it never goes in a Redux slice.**

Putting server data in a slice means you hand-write the loading flag, the error
flag, the refetch, the cache and the invalidation. That is roughly 40 lines per
endpoint, times about 35 endpoints, all of which RTK Query already wrote for
you. The `createAsyncThunk` + `extraReducers` pattern you may have seen in
tutorials is exactly this mistake.

### What actually goes in a Redux slice

Almost nothing. In this project, two slices:

```ts
// authSlice — token and current user. Must survive refresh, so it is persisted.
{ token: string | null, user: JwtUser | null }

// uiSlice — appearance only.
{ theme: 'light' | 'dark' | 'system', sidebarCollapsed: boolean }
```

That is the entire Redux store. Everything else is RTK Query cache or local
component state. If you find yourself adding a third slice, check first whether
the data came from the server.

## Store setup

```ts
// app/store.ts
export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    auth: authReducer,
    ui: uiReducer,
  },
  middleware: (gdm) => gdm().concat(baseApi.middleware),
});

setupListeners(store.dispatch);   // enables refetchOnFocus / refetchOnReconnect
```

## The API layer

One `createApi` for the whole app. Features attach their endpoints to it with
`injectEndpoints`, so each feature owns its own file but they all share one
cache and one tag registry.

```ts
// app/api/baseApi.ts
const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

// Log out automatically on 401 instead of showing a broken screen
const baseQueryWithAuth: BaseQueryFn = async (args, api, extra) => {
  const result = await rawBaseQuery(args, api, extra);
  if (result.error?.status === 401) api.dispatch(logout());
  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: [
    'Employee', 'Department',
    'Attendance', 'AttendanceSummary',
    'LeaveRequest', 'LeaveBalance',
    'PayrollRun', 'Payslip',
    'Due',
    'Notification',
    'Report',
    'Candidate', 'JobPosting',
  ],
  endpoints: () => ({}),
});
```

## Tags — how cache invalidation actually works

This is the mechanism behind the flow you described, so it is worth being
precise about.

- A **query** declares what it `providesTags` — "this cache entry contains
  LeaveRequest data".
- A **mutation** declares what it `invalidatesTags` — "I changed LeaveRequest
  data".
- After a mutation succeeds, RTK Query finds every mounted query providing a
  matching tag and refetches it automatically.

```ts
// app/api/endpoints/leaveApi.ts
export const leaveApi = baseApi.injectEndpoints({
  endpoints: (build) => ({

    getMyLeaveRequests: build.query<LeaveRequest[], void>({
      query: () => '/leave/requests/me',
      providesTags: (result) => [
        { type: 'LeaveRequest', id: 'MY_LIST' },
        ...(result ?? []).map((r) => ({ type: 'LeaveRequest' as const, id: r.id })),
      ],
    }),

    getPendingLeaveRequests: build.query<LeaveRequest[], void>({
      query: () => '/leave/requests/pending',
      providesTags: [{ type: 'LeaveRequest', id: 'PENDING' }],
    }),

    getLeaveBalance: build.query<LeaveBalance[], void>({
      query: () => '/leave/balance/me',
      providesTags: [{ type: 'LeaveBalance', id: 'ME' }],
    }),

    createLeaveRequest: build.mutation<LeaveRequest, CreateLeaveRequestDto>({
      query: (body) => ({ url: '/leave/requests', method: 'POST', body }),
      invalidatesTags: [
        { type: 'LeaveRequest', id: 'MY_LIST' },
        { type: 'LeaveRequest', id: 'PENDING' },
      ],
    }),

    reviewLeaveRequest: build.mutation<LeaveRequest, ReviewArgs>({
      query: ({ id, ...body }) => ({
        url: `/leave/requests/${id}/review`, method: 'PATCH', body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'LeaveRequest', id },
        { type: 'LeaveRequest', id: 'PENDING' },
        { type: 'LeaveRequest', id: 'MY_LIST' },
        { type: 'LeaveBalance', id: 'ME' },   // approval consumes balance
      ],
    }),
  }),
});
```

### Two tag rules

**Use list IDs, not bare tag names.** `invalidatesTags: ['LeaveRequest']`
invalidates *every* leave query in the app, including ones on screens nobody is
looking at. `{ type: 'LeaveRequest', id: 'PENDING' }` invalidates one.

**Invalidate across features when a rule crosses them.** Approving leave changes
the balance, so the approve mutation invalidates `LeaveBalance` too. Finalising
payroll creates due payments, so it invalidates `Due`. Miss these and the UI
shows correct data on one screen and stale data on another — the most confusing
bug class there is.

### The cross-user limit — read this

`invalidatesTags` works **inside one browser tab only**. When an employee
submits a leave request, HR's open browser receives no signal and its pending
list does not update. This is not a bug in your code; it is what cache
invalidation is.

Your flow is otherwise exactly right — it just needs one extra mechanism to
cross the gap between two users. See
[Realtime & Cache Invalidation](08-realtime-and-cache-invalidation.md).

## Folder structure

```
src/
├── app/
│   ├── store.ts
│   ├── hooks.ts                useAppDispatch, useAppSelector (typed)
│   └── api/
│       ├── baseApi.ts
│       └── endpoints/
│           ├── authApi.ts
│           ├── employeeApi.ts
│           ├── attendanceApi.ts
│           ├── leaveApi.ts
│           ├── payrollApi.ts
│           ├── duesApi.ts
│           ├── aiApi.ts
│           ├── reportApi.ts
│           └── notificationApi.ts
│
├── components/
│   ├── ui/                     Button Input Select Table Modal Badge Card
│   │                           Skeleton EmptyState Pagination Toast
│   └── layout/                 AppShell Sidebar Topbar ThemeToggle
│                               NotificationBell
│
├── features/
│   ├── auth/
│   │   ├── authSlice.ts
│   │   └── pages/LoginPage.tsx
│   ├── employees/
│   │   ├── pages/              EmployeeListPage EmployeeDetailPage
│   │   └── components/         EmployeeForm EmployeeTable
│   ├── attendance/
│   ├── leave/
│   ├── payroll/
│   ├── dues/
│   ├── ai-chat/
│   ├── reports/
│   └── recruitment/
│
├── routes/
│   ├── AppRoutes.tsx
│   └── ProtectedRoute.tsx
├── hooks/                      useTheme useDebounce
├── lib/                        formatCurrency formatDate cn
├── types/                      shared with backend
└── styles/globals.css
```

### Rules for this structure

- **A feature folder never imports from another feature folder.** Shared pieces
  move to `components/ui` or `lib`. This keeps features independently deletable
  and is the frontend equivalent of the backend's module boundaries.
- **`components/ui` never imports from `features`.** UI components take props.
  If a `Button` imports `useGetEmployeesQuery`, the structure has broken.
- **A page composes, it does not implement.** Fetch at the page, pass data down
  as props. Do not call hooks in five nested children.

## The sidebar

Module-driven with a second level of sub-modules per feature. The full tree,
the role filtering, the item states and the collapsed-rail behaviour are
specified in **[Navigation & Layout](14-navigation-and-layout.md)** — including
the `NAV` configuration object that drives the sidebar, the routes, the
breadcrumbs and the page titles from one place.

The short version:

```ts
// components/layout/navigation.ts — see doc 14 for the complete tree
export const NAV: NavGroup[] = [
  { items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ALL },
      { label: 'Leave', icon: CalendarDays, roles: ALL, children: [
          { label: 'My Leave',      path: '/leave',           roles: ALL },
          { label: 'Request Leave', path: '/leave/new',       roles: ALL },
          { label: 'Approvals',     path: '/leave/approvals', roles: HR_UP,
            badge: 'pendingLeave' },
          /* … */
      ]},
      /* … */
  ]},
  /* … */
];
```

```tsx
const groups = navForRole(user.role);
```

One object is the single source of truth. Adding a screen is one entry here plus
one route; a parent whose children are all filtered out for a role disappears
entirely, and a parent left with exactly one child renders as a flat link.

Employees see six top-level items; HR sees nine. Same components, different data
— the backend scopes it, so there are no parallel screens per role.

## Loading and error states

Every screen handles four states. There is no fifth, and skipping any of them is
what makes an app feel unfinished.

```tsx
const { data, isLoading, isError, error } = useGetEmployeesQuery();

if (isLoading) return <TableSkeleton rows={8} />;
if (isError)   return <ErrorState error={error} onRetry={refetch} />;
if (!data?.length) return <EmptyState title="No employees yet" action={...} />;
return <EmployeeTable data={data} />;
```

Use skeletons, not spinners, for lists and tables — the layout does not jump
when data arrives.

## Forms

`react-hook-form` + `zod`, with the schema shared from `types/`. One schema
validates the form in the browser and documents the shape the backend expects.

```tsx
const form = useForm<CreateLeaveRequestDto>({
  resolver: zodResolver(createLeaveRequestSchema),
});

const [createRequest, { isLoading }] = useCreateLeaveRequestMutation();

const onSubmit = async (values: CreateLeaveRequestDto) => {
  try {
    await createRequest(values).unwrap();   // .unwrap() so errors throw
    toast.success('Leave request submitted');
    navigate('/leave');
  } catch (e) {
    toast.error(getErrorMessage(e));
  }
};
```

`.unwrap()` is not optional. Without it the mutation promise resolves even when
the request failed, and your success toast fires on a 400.

## Performance

The rules that matter at this scale, and no others:

- **Server-side pagination** on employees, attendance and audit logs. Never
  fetch all rows and paginate in the browser.
- **Debounce search inputs** by 300 ms before they hit a query hook.
- **`skip` dependent queries** — `useGetPayslipQuery(id, { skip: !id })`.
- **Lazy-load route components** with `React.lazy`. Reports and Recruitment are
  the heaviest and the least visited.
- Do **not** reach for `useMemo`, `useCallback` or `React.memo` pre-emptively.
  At this data volume they cost more in complexity than they return. Add them
  when a profiler shows a problem, not before.
