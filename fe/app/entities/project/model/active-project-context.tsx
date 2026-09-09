import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

import { useProjectsQuery } from '~/entities/project/api/project.queries'
import type { Project, ProjectRole } from '~/entities/project/model/project'
import { getActiveProjectId, setActiveProjectId } from '~/shared/api'

interface ActiveProjectValue {
	projects: Project[]
	activeProject: Project | null
	role: ProjectRole | null
	isLeader: boolean
	isLoading: boolean
	selectProject: (projectId: string) => void
}

// The default is never the value a consumer sees in the running app — the
// provider wraps everything that reads it — so it stands for "still loading"
// rather than for a project nobody has.
const ActiveProjectContext = createContext<ActiveProjectValue>({
	projects: [],
	activeProject: null,
	role: null,
	isLeader: false,
	isLoading: true,
	selectProject: setActiveProjectId
})

export function useActiveProject (): ActiveProjectValue {
	return useContext(ActiveProjectContext)
}

export function ActiveProjectProvider ({ children }: { children: ReactNode }) {
	const { data: projects, isPending } = useProjectsQuery()

	// The stored id is a memory of a membership, not proof of one: it survives
	// being removed from the project, and a header naming a project the caller is
	// no longer in answers 404 on every screen at once.
	const activeProject = useMemo(() => {
		if (!projects || projects.length === 0) {
			return null
		}

		const storedId = getActiveProjectId()

		return projects.find((project) => project.id === storedId) ?? projects[0] ?? null
	}, [projects])

	useEffect(() => {
		setActiveProjectId(activeProject?.id ?? null)
	}, [activeProject])

	const value = useMemo<ActiveProjectValue>(() => ({
		projects: projects ?? [],
		activeProject,
		role: activeProject?.role ?? null,
		isLeader: activeProject?.role === 'leader',
		isLoading: isPending,
		selectProject: (projectId: string) => {
			setActiveProjectId(projectId)
		}
	}), [projects, activeProject, isPending])

	return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>
}
