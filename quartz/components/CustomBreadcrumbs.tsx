import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { Breadcrumbs as BaseBreadcrumbs } from "@quartz-community/breadcrumbs"

const kmFolderMap: Record<string, string> = {
  characters: "តួអង្គ",
  events: "ព្រឹត្តិការណ៍",
  factions: "បក្សសម្ព័ន្ធ",
  locations: "ទីតាំង",
  lore: "ឯកសារ",
  "anajak-forces": "កងកម្លាំងអាណាចក្រ",
  lendermaire: "ឡង់ឌែរម៉ែរ",
  vista: "វីស្តា",
  "maire-o'mare": "ម៉ែរ អូម៉ែរ",
  "maire-o-mare": "ម៉ែរ អូម៉ែរ",
  "maire o'mare": "ម៉ែរ អូម៉ែរ",
  "maire omare": "ម៉ែរ អូម៉ែរ",
  countries: "ប្រទេស និងដែនដី",
}

export default ((opts?: any) => {
  const baseComponent = BaseBreadcrumbs(opts)

  const CustomBreadcrumbs: QuartzComponent = (props: QuartzComponentProps) => {
    const vnode = baseComponent(props)
    if (!vnode) return null

    const slug = props.fileData.slug || ""
    const isKm = slug === "km" || slug.startsWith("km/")

    if (isKm && vnode.props && Array.isArray(vnode.props.children)) {
      const children = vnode.props.children
      // If root crumb is "Home" and second crumb is "ណូលហែម" (the km folder)
      if (
        children.length > 1 &&
        children[0]?.props?.children?.[0]?.props?.children === "Home"
      ) {
        // Shift off the English Home root
        children.shift()
        // The km crumb is now index 0: rename to "ទំព័រដើម"
        if (children[0]?.props?.children?.[0]?.props) {
          children[0].props.children[0].props.children = "ទំព័រដើម"
        }
        // If there's only 1 child left, remove spacer
        if (children.length === 1 && children[0]?.props?.children) {
          children[0].props.children[1] = false
        }
      } else if (
        children.length === 1 &&
        children[0]?.props?.children?.[0]?.props?.children === "Home"
      ) {
        children[0].props.children[0].props.children = "ទំព័រដើម"
      }

      // Translate any folder segments in between
      for (let i = 1; i < children.length - 1; i++) {
        const aProps = children[i]?.props?.children?.[0]?.props
        if (aProps && typeof aProps.children === "string") {
          const raw = aProps.children.toLowerCase().trim()
          if (kmFolderMap[raw]) {
            aProps.children = kmFolderMap[raw]
          }
        }
      }
    }

    return vnode
  }

  CustomBreadcrumbs.css = baseComponent.css
  return CustomBreadcrumbs
}) satisfies QuartzComponentConstructor
