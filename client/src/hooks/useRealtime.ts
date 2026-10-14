import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { getAccessToken, refreshSession } from "../api/http";

const events = ["appointment:created", "appointment:updated", "appointment:cancelled"];
const refreshedData = ["slots", "appointments", "dashboard"];

// Keeps open screens current. The server only says that an appointment changed; this refetches
// whatever is on screen through the normal API, so permissions are checked there as usual.
export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refetch = () => refreshedData.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

    // The callback runs on every (re)connection, so a reconnect uses the current access token.
    const socket = io({ auth: (send) => send({ token: getAccessToken() }) });

    events.forEach((event) => socket.on(event, refetch));
    // After a reconnect, changes may have been missed while offline.
    socket.on("connect", refetch);
    // The access token had expired: renew it (shared with API calls) and try again.
    socket.on("connect_error", (err) => {
      if (err.message === "UNAUTHORIZED") refreshSession().then(() => socket.connect(), () => {});
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);
}
