"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";

type ProfileEditorProps = {
  initial: {
    firstName: string;
    lastName: string;
    email: string | null;
    gradeLevel: string;
    schoolName: string;
    city: string;
    province: string;
    country: string;
  };
};

const GRADE_LEVEL_OPTIONS = [
  "Kindergarten",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12",
] as const;


// Alphabetical (human-friendly) list of countries.
// NOTE: Store the plain name string in Clerk unsafeMetadata.
const COUNTRY_OPTIONS = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo (Congo-Brazzaville)",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia (Czech Republic)",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini (fmr. Swaziland)",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Holy See",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar (formerly Burma)",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine State",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
] as const;

function pickClerkErrorMessage(err: unknown): string {
  const anyErr = err as any;
  const fromClerk = anyErr?.errors?.[0]?.longMessage || anyErr?.errors?.[0]?.message;
  if (typeof fromClerk === "string" && fromClerk.trim()) return fromClerk;
  if (typeof anyErr?.message === "string" && anyErr.message.trim()) return anyErr.message;
  return "Something went wrong. Please try again.";
}

function SelectChevron() {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function ProfileEditor({ initial }: ProfileEditorProps) {
  const { isLoaded, user } = useUser();

  const [firstName, setFirstName] = React.useState(initial.firstName);
  const [lastName, setLastName] = React.useState(initial.lastName);
  const [gradeLevel, setGradeLevel] = React.useState(initial.gradeLevel);
  const [schoolName, setSchoolName] = React.useState(initial.schoolName);
  const [city, setCity] = React.useState(initial.city);
  const [province, setProvince] = React.useState(initial.province);
  const [country, setCountry] = React.useState(initial.country);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const normalizedGrade = gradeLevel?.trim() ?? "";
  const normalizedCountry = country?.trim() ?? "";

  // If an existing value is not in our dropdown list (e.g. old freeform value),
  // keep it selectable so the user doesn’t “lose” it.
const gradeOptions: string[] = React.useMemo(() => {
  const base = Array.from(GRADE_LEVEL_OPTIONS) as string[];

  // If an existing value is not in our dropdown list (e.g. old freeform value),
  // keep it selectable so the user doesn’t “lose” it.
  if (
    normalizedGrade &&
    normalizedGrade !== "Other" &&
    normalizedGrade !== "Optional" &&
    !base.includes(normalizedGrade)
  ) {
    base.unshift(normalizedGrade);
  }

  return base;
}, [normalizedGrade]);
const countryOptions: string[] = React.useMemo(() => {
  const base = Array.from(COUNTRY_OPTIONS) as string[];

  if (
    normalizedCountry &&
    normalizedCountry !== "Optional" &&
    !base.includes(normalizedCountry)
  ) {
    base.unshift(normalizedCountry);
  }

  return base;
}, [normalizedCountry]);


  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isLoaded || !user) return;

    const fn = firstName.trim();
    const ln = lastName.trim();

    if (!fn || !ln) {
      setError("Please enter both a first name and last name.");
      return;
    }

    setSaving(true);
    try {
      const existingUnsafe = (user.unsafeMetadata || {}) as Record<string, any>;

      await user.update({
        firstName: fn,
        lastName: ln,
        unsafeMetadata: {
          ...existingUnsafe,
          gradeLevel: normalizedGrade,
          schoolName: schoolName.trim(),
          city: city.trim(),
          province: province.trim(),
          country: normalizedCountry,
        },
      });

      setSuccess("Saved.");
    } catch (err) {
      setError(pickClerkErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Student details</div>
          <div className="mt-1 text-sm text-slate-600">Update your learning profile.</div>
        </div>
      </div>

      <form onSubmit={onSave} className="mt-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">First name</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              autoComplete="given-name"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">Last name</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              autoComplete="family-name"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-700">Email</span>
          <input
            value={initial.email ?? ""}
            readOnly
            className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          />
          <span className="text-xs text-slate-500">Email changes are managed by Clerk.</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">Grade level</span>
            <div className="relative">
              <select
                value={normalizedGrade}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
  <option value="" disabled>
    Select grade level
  </option>
  {gradeOptions.map((opt) => (
    <option key={opt} value={opt}>
      {opt}
    </option>
  ))}
</select>
              <SelectChevron />
            </div>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">School name</span>
            <input
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">City / Town</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">Province / State</span>
            <input
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-700">Country</span>
          <div className="relative">
            <select
              value={normalizedCountry}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
  <option value="" disabled>
    Select country
  </option>
  {countryOptions.map((opt) => (
    <option key={opt} value={opt}>
      {opt}
    </option>
  ))}
</select>
            <SelectChevron />
          </div>
        </label>

        {(error || success) && (
          <div
            className={
              "rounded-2xl border px-4 py-3 text-sm " +
              (error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700")
            }
          >
            {error ?? success}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!isLoaded || saving}
            className={
              "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white " +
              (saving || !isLoaded ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800")
            }
          >
            {saving ? "Saving…" : "Save changes"}
          </button>

          <button
            type="button"
            onClick={() => {
              setFirstName(initial.firstName);
              setLastName(initial.lastName);
              setGradeLevel(initial.gradeLevel);
              setSchoolName(initial.schoolName);
              setCity(initial.city);
              setProvince(initial.province);
              setCountry(initial.country);
              setError(null);
              setSuccess(null);
            }}
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

      </form>
    </div>
  );
}
