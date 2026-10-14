import { useState } from "react";
import type { Patient } from "../api/patients";
import { useDebounce } from "../hooks/useDebounce";
import { usePatientSearch } from "../hooks/queries";
import { Input } from "./Input";
import { Spinner } from "./Spinner";

type Props = { selected: Patient | null; onSelect: (patient: Patient | null) => void; error?: string };

// Search by name, mobile number or patient ID, then pick one result.
export function PatientPicker({ selected, onSelect, error }: Props) {
  const [text, setText] = useState("");
  const term = useDebounce(text.trim());
  const results = usePatientSearch(term);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{selected.name}</span> · {selected.patientCode} · {selected.mobile}
        </span>
        <button type="button" className="text-blue-700 hover:underline" onClick={() => onSelect(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        label="Find patient"
        placeholder="Name, mobile number or patient ID"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={error}
      />
      {results.isFetching && <Spinner className="py-2" />}
      {results.isError && <p className="text-sm text-red-600">{results.error.message}</p>}
      {term && results.data?.length === 0 && !results.isFetching && (
        <p className="text-sm text-gray-600">No patients found. Register them as a new patient instead.</p>
      )}
      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white empty:hidden">
        {results.data?.map((patient) => (
          <li key={patient.id}>
            <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => onSelect(patient)}>
              <span className="font-medium">{patient.name}</span>
              <span className="text-gray-500">
                {patient.patientCode} · {patient.mobile}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
