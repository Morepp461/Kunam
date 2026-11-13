import { useEffect, useMemo, useState } from "react";
import { getAllCitiesOfCountry, getCountries } from "@countrystatecity/countries-browser";

type Country = { iso2: string; name: string; emoji?: string };
type City = { name: string; population?: number | string };

type Props = {
  nationality: string;
  hometown: string;
  onNationalityChange: (value: string) => void;
  onHometownChange: (value: string) => void;
  errors?: { nationality?: string; hometown?: string };
};

export default function LocationSelectors({
  nationality,
  hometown,
  onNationalityChange,
  onHometownChange,
  errors = {},
}: Props) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    getCountries()
      .then((items) => {
        if (!active) return;
        setCountries((items || []).filter((item) => item.iso2 && item.name) as Country[]);
      })
      .catch(() => {
        if (active) setLoadError("Daftar negara gagal dimuat. Periksa koneksi lalu muat ulang halaman.");
      })
      .finally(() => {
        if (active) setLoadingCountries(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!countries.length) return;
    const match = countries.find((country) => country.name.toLocaleLowerCase() === nationality.trim().toLocaleLowerCase());
    setSelectedCode(match?.iso2 || "");
  }, [countries, nationality]);

  useEffect(() => {
    if (!selectedCode) {
      setCities([]);
      return;
    }
    let active = true;
    setLoadingCities(true);
    setLoadError("");
    getAllCitiesOfCountry(selectedCode)
      .then((items) => {
        if (!active) return;
        const valid = (items || []).filter((city) => city.name?.trim()) as City[];
        const sorted = [...valid].sort((a, b) => {
          const populationDifference = Number(b.population || 0) - Number(a.population || 0);
          return populationDifference || a.name.localeCompare(b.name);
        });
        setCities(selectedCode === "ID" ? sorted : sorted.slice(0, 10));
      })
      .catch(() => {
        if (active) {
          setCities([]);
          setLoadError("Daftar kota negara ini gagal dimuat. Coba pilih ulang negara.");
        }
      })
      .finally(() => {
        if (active) setLoadingCities(false);
      });
    return () => { active = false; };
  }, [selectedCode]);

  const selectedCountry = useMemo(
    () => countries.find((country) => country.iso2 === selectedCode),
    [countries, selectedCode],
  );

  const flagFor = (country: Country) => country.emoji || String.fromCodePoint(
    ...country.iso2.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0)),
  );

  return (
    <>
      <label className="settings-field">
        Nationality <span className="required-label">Wajib</span>
        <select
          value={selectedCode}
          disabled={loadingCountries}
          onChange={(event) => {
            const country = countries.find((item) => item.iso2 === event.target.value);
            setSelectedCode(country?.iso2 || "");
            onNationalityChange(country?.name || "");
            onHometownChange("");
          }}
          required
        >
          <option value="">{loadingCountries ? "Memuat negara..." : "Pilih negara / nationality"}</option>
          {countries.map((country) => (
            <option key={country.iso2} value={country.iso2}>
              {flagFor(country)} {country.name}
            </option>
          ))}
        </select>
        {errors.nationality && <small className="field-error">{errors.nationality}</small>}
      </label>
      <label className="settings-field">
        Hometown <span className="required-label">Wajib</span>
        <select
          value={hometown}
          disabled={!selectedCode || loadingCities || cities.length === 0}
          onChange={(event) => onHometownChange(event.target.value)}
          required
        >
          <option value="">
            {!selectedCode ? "Pilih nationality terlebih dahulu" : loadingCities ? "Memuat kota..." : "Pilih kota / hometown"}
          </option>
          {cities.map((city, index) => (
            <option key={city.name + "-" + index} value={city.name}>{city.name}</option>
          ))}
        </select>
        {selectedCountry && <small className="field-hint">{flagFor(selectedCountry)} {selectedCountry.name}{selectedCode === "ID" ? " · Daftar kota Indonesia" : " · Maksimal 10 kota utama"}</small>}
        {errors.hometown && <small className="field-error">{errors.hometown}</small>}
      </label>
      {loadError && <small className="field-error">{loadError}</small>}
    </>
  );
}

export function CountryCodeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [countries, setCountries] = useState<Country[]>([]);
  useEffect(() => {
    let active = true;
    getCountries().then((items) => {
      if (active) setCountries((items || []).filter((item) => item.iso2 && item.name) as Country[]);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Pilih negara circuit</option>
      {countries.map((country) => (
        <option key={country.iso2} value={country.iso2}>
          {country.emoji || country.iso2} {country.name}
        </option>
      ))}
    </select>
  );
}
