// lib/notifyAssigned.ts
export async function notifyTechnicianAssigned(technicianId: string, params: {
  jobId: string;
  projectName: string;
  site?: string;
}) {
  const url = `${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/push/send`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      technicianId,
      payload: {
        title: "Penugasan baru",
        body: `Anda ditugaskan pada proyek ${params.projectName}${params.site ? " — " + params.site : ""}`,
        url: `/user/jobs/${params.jobId}`,
        data: { jobId: params.jobId, projectName: params.projectName },
      },
    }),
  });
}
