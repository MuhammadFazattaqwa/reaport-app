// lib/notifyAssigned.ts
export async function notifyAssignedToTechnician(technicianKeys: string[], params: { projectId: string; projectName?: string; site?: string }) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  await fetch(`${base}/api/push/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      technicianKeys,
      payload: {
        title: "Penugasan baru",
        body: params.projectName ? `Anda ditugaskan pada proyek ${params.projectName}${params.site ? " — " + params.site : ""}` : "Anda mendapat penugasan baru",
        url: `/user/upload_foto?job=${encodeURIComponent(params.projectId)}`,
        data: { projectId: params.projectId, projectName: params.projectName },
      },
    }),
  });
}
