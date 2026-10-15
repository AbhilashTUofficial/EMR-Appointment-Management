import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/http";
import { applyServerError } from "./forms";

const fields = ["name", "mobile", "purpose"];

describe("applyServerError", () => {
  it("puts messages under their inputs, including nested server paths", () => {
    const setError = vi.fn();
    const err = new ApiError(400, "VALIDATION_ERROR", "Invalid request", [
      { field: "newPatient.mobile", message: "Enter a valid mobile number" },
      { field: "purpose", message: "Enter the purpose" },
    ]);

    expect(applyServerError(err, setError, fields)).toBe("");
    expect(setError).toHaveBeenCalledWith("mobile", { message: "Enter a valid mobile number" });
    expect(setError).toHaveBeenCalledWith("purpose", { message: "Enter the purpose" });
  });

  it("still reports messages that have no input, even when others were attached", () => {
    const setError = vi.fn();
    const err = new ApiError(400, "VALIDATION_ERROR", "Invalid request", [
      { field: "name", message: "Too short" },
      { field: "patientId", message: "Provide either patientId or newPatient" },
    ]);

    expect(applyServerError(err, setError, fields)).toBe("Provide either patientId or newPatient");
    expect(setError).toHaveBeenCalledOnce();
  });

  it("falls back to the general message when there are no field errors", () => {
    const setError = vi.fn();
    expect(applyServerError(new ApiError(409, "SLOT_ALREADY_BOOKED", "This slot has just been booked."), setError, fields)).toBe("This slot has just been booked.");
    expect(setError).not.toHaveBeenCalled();
  });

  it("shows a taken email under the email input", () => {
    const setError = vi.fn();
    expect(applyServerError(new ApiError(409, "EMAIL_TAKEN", "A user with this email already exists"), setError, ["email"])).toBe("");
    expect(setError).toHaveBeenCalledWith("email", { message: "A user with this email already exists" });
  });

  it("says the server could not be reached for anything that is not an API error", () => {
    expect(applyServerError(new TypeError("Failed to fetch"), vi.fn(), fields)).toMatch(/Could not reach the server/);
  });
});
