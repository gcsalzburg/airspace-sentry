# Airspace sentry

## Resources
+ https://www.dev.adsbexchange.com/version-2-api-wip/
+ https://datatracker.ietf.org/doc/html/rfc7946#section-9
+ Promote ID example: https://gist.github.com/lobenichou/896118d8014c291c6c63b53f7ecafb28 (with inspiration from: https://stackoverflow.com/questions/56493095/mapbox-layer-features-duplicate-ids, except GeoJSON sources have no sourcelayer) Also: https://github.com/mapbox/mapbox-gl-js/pull/8987
+ `e.features.at(0).toJSON()`
+ https://github.com/mapbox/mapbox-gl-js/issues/3993

## TODO

+ Make planes at high altitude faded out (or something)
+ Show all altitudes on hover
+ Add flight event incursion log below
+ Add better options
+ Add save/restore data, and also export geoJSON option
+ Add height limit checker
+ Save an options object on page reload with search circle. Add clear button for it below