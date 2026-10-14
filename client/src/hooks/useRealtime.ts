import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { getAccessToken, refreshSession } from "../api/http";
import { invalidateAppointmentData } from "./invalidate";

const appointmentEvents = ["appointment:created", "appointment:updated", "appointment:cancelled"];

// Keeps open screens current. The server only says that something changed; this refetches
// whatever is on screen through the normal API, so permissions are checked there as usual.
export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refetch = () => invalidateAppointmentData(queryClient);
    let renewedToken = false;

    // The callback runs on every (re)connection, so a reconnect uses the current access token.
    const socket = io({ auth: (send) => send({ token: getAccessToken() }) });

    appointmentEvents.forEach((event) => socket.on(event, refetch));
    // A changed schedule changes the slots on offer, and the doctor list shows the schedule.
    socket.on("schedule:updated", () => {
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
    });
    socket.on("connect", () => {
      renewedToken = false;
      refetch(); // changes may have been missed while offline
    });
    // The access token had expired: renew it (shared with API calls) and try once more.
    // If that still fails the session is over, and the API calls will say so.
    socket.on("connect_error", (err) => {
      if (err.message !== "UNAUTHORIZED" || renewedToken) return;
      renewedToken = true;
      refreshSession().then(() => socket.connect(), () => {});
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);
}
