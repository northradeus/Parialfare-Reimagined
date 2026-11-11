import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"
import LanguageToggle from "./quartz/components/LanguageToggle"
import CustomPageTitle from "./quartz/components/CustomPageTitle"

componentRegistry.register("page-title", CustomPageTitle, "local")
componentRegistry.register("@quartz-community/page-title", CustomPageTitle, "local")
componentRegistry.register("PageTitle", CustomPageTitle, "local")

// Register local LanguageToggle component
componentRegistry.register("language-toggle", LanguageToggle, "local", {
  name: "language-toggle",
  displayName: "LanguageToggle",
  description: "Bilingual English/Khmer switcher button with page sync and portal fallback",
  version: "1.0.0",
  defaultPosition: "left",
  defaultPriority: 32,
})

const explorerOverrides = {
  folderDefaultState: "collapsed",
  folderClickBehavior: "link",
  useSavedState: true,
  filterFn: function filterFn(node: any) {
    if (node.slugSegment === "tags") return false
    const isKm =
      window.location.pathname.includes("/km/") ||
      window.location.pathname.endsWith("/km") ||
      (typeof document !== "undefined" &&
        document.body &&
        document.body.dataset &&
        document.body.dataset.slug &&
        (document.body.dataset.slug === "km" || document.body.dataset.slug.startsWith("km/")))

    if (isKm) {
      // Root level of the trie: only keep the 'km' folder
      if (node.slugSegments && node.slugSegments.length === 1) {
        return node.slugSegment === "km"
      }
      // Clean up root portal/overview pages from the Khmer sidebar
      if (
        node.slugSegments &&
        node.slugSegments.length === 2 &&
        (node.slugSegment === "overview" ||
          node.slugSegment.startsWith("portal") ||
          (node.displayName &&
            (node.displayName.startsWith("Portal") ||
              node.displayName.startsWith("Overview") ||
              node.displayName.startsWith("វិបផតថល") ||
              node.displayName.startsWith("Parialfare:"))))
      ) {
        return false
      }
      return true
    } else {
      // English mode: completely hide the 'km' folder
      if (node.slugSegment === "km") return false
      return true
    }
  },
  mapFn: function mapFn(node: any) {
    const isKm =
      window.location.pathname.includes("/km/") ||
      window.location.pathname.endsWith("/km") ||
      (typeof document !== "undefined" &&
        document.body &&
        document.body.dataset &&
        document.body.dataset.slug &&
        (document.body.dataset.slug === "km" || document.body.dataset.slug.startsWith("km/")))

    // If at the root node of the trie (before rendering children)
    if (node.slugSegments && node.slugSegments.length === 0) {
      if (isKm) {
        const kmChild = node.children.find((c: any) => c.slugSegment === "km")
        if (kmChild && kmChild.children) {
          node.children = kmChild.children
        }
        const titleEl = document.querySelector(".explorer button.desktop-explorer h2")
        if (titleEl) titleEl.textContent = "មាតិកា"
      } else {
        const titleEl = document.querySelector(".explorer button.desktop-explorer h2")
        if (titleEl) titleEl.textContent = "Explorer"
      }
    }

    if (isKm) {
      const kmFolderMap: Record<string, string> = {
        characters: "តួអង្គ",
        events: "ព្រឹត្តិការណ៍",
        factions: "បក្សសម្ព័ន្ធ",
        locations: "ទីតាំង",
        lore: "ឯកសារ",
        "anajak-forces": "កងកម្លាំងអាណាចក្រ",
        lendermaire: "ឡង់ឌែរម៉ែរ",
        vista: "វីស្តា",
        "maire-o-mare": "ម៉ែរ អូម៉ែរ",
        countries: "ប្រទេស និងដែនដី",
      }
      const seg = (node.slugSegment || "").toLowerCase()
      if (kmFolderMap[seg]) {
        node.displayName = kmFolderMap[seg]
      }
    }
  },
}

componentRegistry.setOptionOverrides("explorer", explorerOverrides)
componentRegistry.setOptionOverrides("@quartz-community/explorer", explorerOverrides)
componentRegistry.setOptionOverrides("Explorer", explorerOverrides)

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
