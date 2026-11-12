export type ProjectAccessRow = {
  client_id: string;
  freelancer_id: string | null;
  freelancer_email: string | null;
};

export function isPendingInvite(project: ProjectAccessRow, userId: string, email?: string | null) {
  return !project.freelancer_id && project.client_id !== userId && project.freelancer_email?.toLowerCase() === email?.toLowerCase();
}

export function isOwnProject(project: ProjectAccessRow, userId: string, isAdmin = false) {
  return isAdmin || project.client_id === userId || project.freelancer_id === userId;
}

export function getOwnProjects<T extends ProjectAccessRow>(projects: T[], userId: string, isAdmin = false) {
  return projects.filter((project) => isOwnProject(project, userId, isAdmin));
}
