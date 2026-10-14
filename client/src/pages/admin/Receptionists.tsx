import { useState } from "react";
import { createReceptionist } from "../../api/receptionists";
import { StaffForm } from "../../components/StaffForm";

export default function Receptionists() {
  const [created, setCreated] = useState("");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Receptionists</h1>
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-medium">New receptionist</h2>
        <StaffForm
          submitLabel="Create receptionist"
          onSubmit={async (values) => {
            await createReceptionist(values);
            setCreated(values.name);
          }}
        />
        {created && (
          <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            {created} can now sign in with the temporary password.
          </p>
        )}
      </section>
    </div>
  );
}
