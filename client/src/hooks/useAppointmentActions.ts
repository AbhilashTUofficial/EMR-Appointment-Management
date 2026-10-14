import { useMutation, useQueryClient } from "@tanstack/react-query";
import { arriveAppointment, cancelAppointment, completeAppointment } from "../api/appointments";

const actions = { arrive: arriveAppointment, cancel: cancelAppointment, complete: completeAppointment };

// Arrive, cancel and complete share one mutation. Afterwards everything that shows appointments
// (lists, the scheduler's slots, the dashboard counts) is refetched.
export function useAppointmentActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id }: { action: keyof typeof actions; id: string }) => actions[action](id),
    onSettled: () =>
      Promise.all(["appointments", "slots", "dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
}
