import { useMutation, useQueryClient } from "@tanstack/react-query";
import { arriveAppointment, cancelAppointment, completeAppointment } from "../api/appointments";
import { invalidateAppointmentData } from "./invalidate";

const actions = { arrive: arriveAppointment, cancel: cancelAppointment, complete: completeAppointment };

// Arrive, cancel and complete share one mutation, followed by a refetch of everything that shows appointments.
export function useAppointmentActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id }: { action: keyof typeof actions; id: string }) => actions[action](id),
    onSettled: () => invalidateAppointmentData(queryClient),
  });
}
