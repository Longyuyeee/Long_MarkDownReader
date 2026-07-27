export interface PptxLocatorObject {
  id: string
}

export interface PptxLocatorSlide {
  id: string
  hidden?: boolean
  objects: PptxLocatorObject[]
}

export interface PptxRouteLocator {
  slide?: string
  locatorKind?: string
  locator?: string
}

export interface PptxResolvedLocator {
  slideIndex: number
  objectId: string
}

export const resolvePptxRouteLocator = (
  slides: readonly PptxLocatorSlide[],
  route: PptxRouteLocator,
): PptxResolvedLocator | undefined => {
  const requestedSlide = Number.parseInt(route.slide || '', 10)
  const pageIndex = Number.isFinite(requestedSlide)
    && requestedSlide >= 1
    && requestedSlide <= slides.length
    ? requestedSlide - 1
    : -1
  let slideIndex = -1
  let objectId = ''

  if (route.locatorKind === 'pptx-slide' && route.locator) {
    slideIndex = slides.findIndex(slide => slide.id === route.locator)
  } else if (route.locatorKind === 'pptx-object' && route.locator) {
    if (pageIndex >= 0 && slides[pageIndex].objects.some(object => object.id === route.locator)) {
      slideIndex = pageIndex
    } else {
      slideIndex = slides.findIndex(slide => slide.objects.some(object => object.id === route.locator))
    }
    if (slideIndex >= 0) objectId = route.locator
  }

  if (slideIndex < 0) slideIndex = pageIndex
  return slideIndex >= 0 ? { slideIndex, objectId } : undefined
}
