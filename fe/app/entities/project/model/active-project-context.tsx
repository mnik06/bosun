import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

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
	// Read once, into state. Reading the store inside the memo instead made the
	// choice a function of something an effect below writes, and the first render
	// — before the projects arrive — wrote null into it, so the remembered project
	// was cleared and every reload snapped back to the first one in the list.
	const [chosenId, setChosenId] = useState(getActiveProjectId)

	// A stored id is a memory of a membership, not proof of one: it survives being
	// removed from the project, and a header naming a project the caller is no
	// longer in answers 404 on every screen at once.
	const activeProject = useMemo(() => {
		if (!projects || projects.length === 0) {
			return null
		}

		return projects.find((project) => project.id === chosenId) ?? projects[0] ?? null
	}, [projects, chosenId])

	// Never cleared back to null: "we do not know yet" and "this person is in no
	// project" would write the same value, and the first one happens on every load.
	useEffect(() => {
		if (activeProject) {
			setActiveProjectId(activeProject.id)
		}
	}, [activeProject])

	const value = useMemo<ActiveProjectValue>(() => ({
		projects: projects ?? [],
		activeProject,
		role: activeProject?.role ?? null,
		isLeader: activeProject?.role === 'leader',
		isLoading: isPending,
		selectProject: (projectId: string) => {
			setChosenId(projectId)
			setActiveProjectId(projectId)
		}
	}), [projects, activeProject, isPending])

	return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>
}
