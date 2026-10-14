import type { QueryClient } from "@tanstack/react-query";

// Everything that shows appointments, so it is refetched whenever one changes: slots in the scheduler,
// the appointment lists and the dashboard counts.
export const invalidateAppointmentData = (queryClient: QueryClient) =>
  Promise.all(["slots", "appointments", "dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
