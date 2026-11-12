<aside class="custom-infobox infobox-system">
<h3>Update Log</h3>
<table>
<tr><th>Title</th><td>Update Log</td></tr>
<tr><th>Subtitle</th><td>Record of changes to the encyclopedia</td></tr>
<tr><th>System Type</th><td>Meta/Changelog</td></tr>
</table>
</aside>


# Update Log

This page records changes to the encyclopedia. Entries appear newest first. Version numbers correspond to the internal publication register and have no in-universe meaning.

## v010 — 12 November 2026

This milestone release establishes the **Documentary Fiction Incident Architecture** across the Nolheim encyclopedia, pivoting the presentation of canon scenes from an encyclopedia-first wiki model into classified, ground-level operational incident logs. It officially declassifies a 3-incident launch buffer alongside an SCP-inspired intelligence archive hub.

- **Documentary Fiction Incident Architecture:** Canonical narrative prose is now structured within an authentic three-tier tactical record bracket:
  1. *Classification Dossier Stamp:* Monospaced tactical header cataloging incident designation, security clearance level, operative callsign, operating theater, timestamp, and asset disposition.
  2. *Opening Surveillance Bracket (`[!record-opening]`):* Pre-scene electronic surveillance intercept, UAV telemetry, or acoustic pickup log framing the tactical environment.
  3. *Canonical Prose Scene:* Unaltered high-fidelity character narrative grounded in August 2008 Cold War canon.
  4. *Closing Archival Debrief (`[!record-closing]`):* Post-incident intelligence assessment, signal burst transcript, or tactical memorandum cross-referencing related network dossiers.
- **Declassified 3-Incident Launch Buffer:**
  - **Incident 001 — The Lot** (`incident.001.the-lot`): GIC surveillance dispatch 44-B recording the recruitment and extraction of operative **Tanishito** ("Varn, Dessa") by concealed 13th operator **Samsara Lykor** from a rain-slicked neon bar along the Pocheasang Strip.
  - **Incident 002 — The Youngest** (`incident.002.the-youngest`): VISTA acoustic pickup log of morning household dynamics inside the Site-29 compound (featuring Hanktonio, Gunter, Grunt, Leepy, Joey, and Konish), tracking SIGINT lead **Vanny** carrying breakfast up to Lykor on the roof while mentally calculating the unresolved "fourth approach" into the perimeter.
  - **Incident 003 — The Thirteenth** (`incident.003.the-thirteenth`): High-altitude thermal/audio intercept of a private rooftop summit between **Samsara Lykor** and commander **Konish Kimbotin**. The debrief dissects the household's twelve doors (eleven open, one locked), confirms Lykor's rejection of an unconditional repatriation offer from the Ironish Task Force, and documents his voluntary commitment to the unit.
- **SCP-Inspired Classified Archive Hub (`/incidents`):**
  - Built a dedicated intelligence log repository featuring interactive log rows with monospaced metadata, styled dotted leader bridges (`.scp-log-dots`), tab filtering (`All Records`, `Operational Incidents`, `Surveillance Intercepts`, `Site-29 Files`), hoverable redaction black-bars (`.redacted`), and terminal pagination (`page 1 of 1 [1]`).
- **Encyclopedia Shell & Pinned Premise:**
  - Pinned the central narrative thesis prominently into the homepage hero: *"A household of people every institution threw away becomes the one thing a superpower cannot buy back."*
  - Added a dedicated direct gateway button: `★ Declassified Incident Archive (Incidents 001–003)`.
- **Nolheim Studio Suite (`:3333`) Integration:**
  - Added an `Incidents` category filter pill to the Studio control center with full indexer support, categorizing incidents under `Declassified Incidents` and `LENDERMAIRE // GIC`.
  - Added preview renderer support for `[!record-opening]` and `[!record-closing]` callout blocks with custom crimson teletype borders.
- **Compiler Hardening (`build-content.cjs`):**
  - Updated index generation rules to protect custom directory hub files from automated category grid overwrites.
  - Preserved YAML frontmatter and eliminated duplicate classification box injections during automated builds.

## v009 — 12 November 2026

This update delivers a major geopolitical and aerial expansion across the eastern continent and the northern DMZ, formally introducing the sovereign **Empire of Thaiphon** and the revised aerial theatre of **Operation Numbrad**.

- **Empire of Thaiphon:** A dedicated country dossier establishes Thaiphon as an ancient high-tech constitutional empire centered in the coastal capital of **Odate-Kyo**, under the ceremonial anchor of **Emperor Kenshin** and civilian Prime Minister **Daisuke Takeda**. The record details Thaiphon's historical role in the medieval grand coalition against the Deck Empire, its centuries-old expeditionary alliance with the **Shijo** clan, its charter membership in VISTA advocating electronic containment over ground invasions, and its cultural veneration of aerospace aviators ("The Pilot Cult").
- **Clash I Aerial Convergence & "The Sun":** The record of the Mach 2 dogfight above New Aester has been fundamentally expanded. Alongside **Takahashi** ("Sahara")—whose debrief reveals his shootdown was the result of panicking coalition anti-aircraft fire following his ground strike on Salmon—the archive introduces his tragic counterpart: **Hayakawa Oradachi** ("Infinity" / "Aifensto"), an exiled Thaiphonese racing driver recruited abroad into Konish's shadow interceptor wing at **Area-31**, killed by G-LOC and internal flare combustion before his uncrewed ghost ship was secretly recovered by Konish's Group.
- **Area-31 & Lore Reconciliation:** Area-31's dossier documents the clandestine recovery of Infinity's airframe in the Ironclad interior, while the **Kingdom of Encore** article excises the public translation of *Anajak*, sealing the deliberate institutional silence shared by Pich, Northrad, and the Black Kroma.
- **Dossier & Incident Refinements:** Synchronized recent personnel records across **Anajak Forces** and **LENDERMAIRE**, alongside the archival indexing of **Incident 001 — The Lot** and regional portal navigation.

## v008 — 11 November 2026

This major update introduces the bilingual deployment of the encyclopedia, establishing native Khmer language infrastructure across the entire archive while preserving unified publication under a single repository.

- **Bilingual Single-Repository Architecture:** Deployed a complete Khmer branch under `/km/` alongside the primary English dossiers. The site now features a persistent, responsive language switcher (`[ 🌐 ខ្មែរ ]` / `[ 🌐 English ]`) mounted dynamically into the toolbar header. The switcher performs intelligent path mapping to keep readers synchronized on the corresponding dossier when transitioning between languages, falling back gracefully to category portals when direct counterpart files are undergoing translation.
- **Isolated Khmer Explorer Hierarchy:** Introduced dynamic tree filtering and folder mapping for the Explorer sidebar. When browsing Khmer pages, the sidebar displays native Khmer taxonomy (`មាតិកា`), showcasing localized top-level folders (`តួអង្គ`, `ទីតាំង`, `បក្សសម្ព័ន្ធ`, `ព្រឹត្តិការណ៍`, `ឯកសារ`) and operational sub-organizations (`កងកម្លាំងអាណាចក្រ`, `ឡង់ឌែរម៉ែរ`, `វីស្តា`, `ម៉ែរ អូម៉ែរ`, `ប្រទេស និងដែនដី`), completely isolated from the English vault hierarchy.
- **Localized Navigation & Dynamic Breadcrumbs:** Localized root page title branding (`ណូលហែម` on Khmer, `Nolheim` on English), custom author attributions (`ឆុំ ពេជ្រត្យា ឆាណាន់` / `Chhum Pichthyachhanan`), and native breadcrumb paths (`ទំព័រដើម ❯ <ប្រភេទ> ❯ <ចំណងជើង>`) with automatic normalization of redundant crumb segments.
- **Category Portals & Responsive Card Grids:** Generated automated index directory grids for all Khmer folders and sub-organizations (`ឡង់ឌែរម៉ែរ`, `កងកម្លាំងអាណាចក្រ`, `វីស្តា`, `ម៉ែរ អូម៉ែរ`), featuring responsive card components, operational status badges (`សេចក្តីព្រាង` / Draft), character thumbnails, and dual-language subtitles.
- **Media Assets Pipeline & Gallery Normalization:** Hardened the build pipeline (`build-content.cjs`) with cross-directory asset junctions (`/km/assets/`), automatic markdown image resolver guards, and inline HTML figure transforms for multi-photo gallery layouts (`Konish Kimbotin`, `Noradus`).

## v007 — 11 November 2026

This update expands eastern continental intelligence with the formal introduction of the **Kingdom of Encore** and the **Black Kroma**. Encore's sovereign dossier documents its dual colonial heritage under Lurkinsberg and Ai'ron, its formalized close-combat doctrine, and the confidential bilateral security agreement with VISTA that christened **Anajak Forces**. The accompanying file for the **Black Kroma** details its historical transition from a mid-century totalitarian insurgent regime to an entrenched armed establishment coexisting alongside the Encorean Royal Army. Within the frontline factions, **LENDERMAIRE**'s profile now details field dress and GreyFox V5 forensic footwear markers, accompanied by newly recovered CCTV and bodycam frames from the **2008 Pocheasang Palace Raid**. Major personnel expansions include the complete dossier for assaulter **Andrew**—tracing his firefighter beginnings, squad loyalty, Numbrad trauma, and crossover into the GIC—alongside early academy variant seeds for **Tanishito** and updated command records for **Hanktonio**.

## v006 — 10 November 2026

This major expansion brings extensive new intelligence across the southern theatre, the Ironclad frontier, and the Kingdom of Ai'ron.

Dossiers for **Konish Kimbotin**, **Konish's Group**, and the **Ironclad DMZ** have been substantially deepened. The records establish Kimbotin's mixed Cladish-Jen lineage, his ceremonial Cladish name (*Kon 'aishen Kimbo 'shin*), his front-line alias (*"Knish"*), and the Kingdom of Ai'ron's official adjectival delegitimization (*"Konisharic"* / *"Konisharic Reign"*). Internally, Konish's Group is now documented as a functioning proto-state protecting an unmapped, hidden civilian civilization in the southern interior.

Anchoring the northern perimeter opposite New Aester, the brutalist redoubt of **Area-31 (Shaiken)** is now fully documented alongside new architectural concept art. Operating city-scale reinforced concrete bastions, a dense integrated air-defense umbrella, and subterranean hangars housing supersonic interceptors (*"The Sun"*), Area-31 represents the primary operational barrier that halted New Aester's planned Southern Frontier Expansion. In turn, **New Aester** and **Ironland** have been updated to reflect the armed standoff and Ai'ron's formal onomastic traditions (*-enstine*, *-anski*, and *-aric*), with **Noradus** cross-referenced under his administrative exonym *Noradanski*.

Additionally, historical casualty logs have been reconciled following Anajak Forces counter-insurgency sorties, confirming the death in action of LENDERMAIRE shock trooper **Salmon** by the pilot **Takahashi** ("Sahara"), and portal directories across the continuity have been standardized with strict frontmatter compliance.

## v005 — 10 November 2026

Visual records have been expanded for **Konish Kimbotin** and **Noradus**. Konish's dossier now includes a three-part visual gallery covering recovered entry footage from the 2008 Pocheasang raid, field photography from southern Ironclad, and an equipment assessment sheet. Noradus's record has been updated with a new primary portrait alongside archival imagery of the VISTA president in his office with his adjutant, Pepper.

## v004 — 9 November 2026

New records have been added to the archive for **Takahashi** ("Sahara"), a Thaiphonese strike fighter pilot transferred into Anajak Forces by General Ramcher, and **Pich**, an Encorean close-combat specialist and field interpreter serving in Tarnished's detachment.

Across the Anajak Forces records, the heritage of **Tanishito** and **Nogo** is now recorded as mixed Thaiphonese and Lurkish, while **Verdanski** is recorded as of rare mixed Cladish and Thaiphonese descent. In addition, the **LENDERMAIRE** household roster has been updated to retire the former Verdansk entry and include Bizmo among its associated personnel, and cross-references across the Anajak Forces roster have been unified.

## v003 — 9 November 2026

Minor grammatical and stylistic corrections were applied to the records of Noradus, Tanishito, and Grunt to ensure consistency with the vault's institutional formatting standards. Additionally, the record for Salmon was significantly expanded and updated.

## v002 - 9 November 2026

Small corrections to three articles. The name of Konish's Group is now written consistently across the archive. A note in Noradus's relationship with Tanishito has been reworded for clarity. A duplicate reference in LENDERMAIRE's cross-reference list has been merged.

## v001 — 9 November 2026

The encyclopedia opens. Nothing here is a change to the record — this is where the record begins.
