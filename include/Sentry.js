
export default class{
	
	// Master object that contains all the data we've tracked
	trackedData = {
		lastData: 0,
		loggedTracks: {
			totalTracks : 0,
			geoJSON: {
				type: "FeatureCollection",
				features: []
			}					
		},
		incursionTracks: [],
		activeFlights: []
	}

	// Reference array for all aircraft markers on screen
	mapMarkers = []

	// Mapbox map object
	map = null

	// Search area for incursions
	searchPoly = null

	// Default options are below
	options = {
		debug: false,
		show_data_circle: true,
		centre: {
			lng: -1.966238,
			lat: 55.055068,
			zoom: 9
		},
		search: {
			radius: 38000, // best = 38000
			ratio: 0.0005399568, // 1m = x nautical miles
		},
		intersect_area: '/data/tda.geojson',
		rapidAPI: {
			key: '',
			host: 'adsbexchange-com1.p.rapidapi.com'
		},
		mapbox_token: '',
		mapbox_style: 'mapbox://styles/gcsalzburg/cjmn85as2dzu12rpkmaw53hsj',
		fetch: {
			interval: 5,
			nextFetch: 0
		},
		styles: {
			colours: {
				tda: 'rgb(249, 241, 138)',
				searchArea: 'rgb(145, 201, 239)',
				trackActive: 'rgb(230, 145, 239)',
				trackInactive: 'rgba(255, 255, 255 ,0.3)'
			}
		}
	}


	// Constructor, to merge in options
	constructor(options){

		// TODO: Make this a deep merge
		this.options = {...this.options, ...options}

		// Helper for when we want to debug
		if(this.options.debug){
			this.options.search.radius = 150000
			this.options.centre.zoom = 7
			this.options.fetch.interval = 2
		}

		// Load RapidAPI Key
		this.loadAPIKey()

		// Load Mapbox Map
		this.initSentry()
	}

	// Start the Sentry
	initSentry = async () => {

		// Load the Mapbox map
		this.map = new mapboxgl.Map({
			accessToken: this.options.mapbox_token,
			container: this.options.dom.mapbox,
			style: this.options.mapbox_style, // style URL // TODO: Reduce dominance of underlying roads
			center: [this.options.centre.lng, this.options.centre.lat], // starting position [lng, lat]
			zoom: this.options.centre.zoom, // starting zoom
		})


		// Load in search area polygon from file
		this.searchPoly = await fetch(this.options.intersect_area).then(response => response.json()).catch(err => `Error loading search area: ${err}`)

		// Once the map has loaded
		this.map.on('load', async () => {

			// Render the data fetch request circle
			if(this.options.show_data_circle){
				this.initDataCircle()
			}

			// Load previously saved data from memory
			this.fetchTrackedDataFromStorage()

			// Draw the search area on the map
			this.initSearchArea()

			// Draw existing data from storage
			// TODO: Draw the active tracks as well
			this.addLoggedTracks()

			// Start fetching data
			await this.fetchAndRender()
	
		})
	}

	// Draws a circle to show the search area for ADSB-Exchange
	// Uses: https://github.com/smithmicro/mapbox-gl-circle/
	initDataCircle = () => {
		new MapboxCircle({lat: this.options.centre.lat, lng: this.options.centre.lng}, this.options.search.radius, {
			editable: false,
			fillColor: `${this.options.styles.colours.searchArea}`,
			fillOpacity: 0.05,
			strokeWeight: 0,
		}).addTo(this.map)
	}

	// Draw the search area onto the map
	initSearchArea = () => {
		// Add a data source containing GeoJSON data.
		this.map.addSource('searchArea', {
			'type': 'geojson',
			'data': this.searchPoly
		})
		
		// Add a new layer to visualize the polygon.
		this.map.addLayer({
			'id': 'searchArea',
			'type': 'fill',
			'source': 'searchArea', // reference the data source
			'layout': {},
			'paint': {
				'fill-color': `${this.options.styles.colours.tda}`,
				'fill-opacity': 0.7
			}
		})
	}




	// Interection check
	/*
	let active = this.trackedData.flights.filter(flight => flight.is_active)

			const generateRandomString = () => {
				return Math.floor(Math.random() * Date.now()).toString(36);
			};

			for(let flight of active){
				if(flight.coordinates.length > 1){

					const line = {
						"type": "Feature",
						"properties": {},
						"geometry": {
							'type': 'LineString',
							"coordinates": flight.coordinates
						}
					}


					let intersectionPoints = turf.lineIntersect(line, this.searchPoly)
					let intersectionPointsArray = intersectionPoints.features.map(d => {return d.geometry.coordinates})

					if(intersectionPointsArray.length > 0){
						let intersection = turf.lineSlice(turf.point(intersectionPointsArray[0]), turf.point(intersectionPointsArray[1]), line);

						console.log(flight.flightName, `${Math.round(turf.length(turf.lineString(flight.coordinates)))}km`)
						console.log(intersection)

						const sourceName = generateRandomString()

						this.map.addSource(sourceName, {
							'type': 'geojson',
							'data': intersection
						})
						this.map.addLayer({
							'id': sourceName,
							'type': 'line',
							'source': sourceName,
							'layout': {
								'line-join': 'round',
								'line-cap': 'round'
							},
							'paint': {
								'line-color': `red`,
								'line-width': 6,
								'line-blur': 0
							}
						})
					}
				}
			}


	*/


	// **********************************************************

	fetchAndRender = async () => {

		// Fetch new data from ADSB and update trackedData.activeFlights with it
		await this.fetchADSB()

		// Clean up completed flights from the map
		this.checkForCompletedFlights()

		// Update localStorage
		this.saveTrackedDataToStorage(this.trackedData)

		// Update stats
		this.updateStats()

		// Render the active Tracks
		this.drawTracks()

		// Fetch again!
		setTimeout(() => {
			this.fetchAndRender()
		}, this.options.fetch.interval*1000)
		this.options.fetch.nextFetch = Date.now()/1000 + this.options.fetch.interval
	}

	// **********************************************************
	// Fetch data
	// Grab new update of data from ADSB Exchange via RapidAPI
	fetchADSB = async () => {

		// Fetch data from ADSB Exchange
		const url = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${this.options.centre.lat}/lon/${this.options.centre.lng}/dist/${this.options.search.radius * this.options.search.ratio}/`;
		const options = {
			method: 'GET',
			headers: {
				'X-RapidAPI-Key': this.options.rapidAPI.key,
				'X-RapidAPI-Host': this.options.rapidAPI.host
			}
		}
		const newFlightData = await fetch(url, options).then(response => response.json()).catch(err => console.log(err))

		if(newFlightData){

			const requestTime = newFlightData.now // TODO: Check if this is the correct time measurement to use
			this.trackedData.lastData = requestTime

			const flights = newFlightData.ac.filter(flight => flight.alt_baro != 'ground') // Only aircraft that are in the air please

			let activeFlightHexes = []

			// Iterate over each new aircraft
			for(let aircraft of flights){

				// If it doesn't exist in the activeFlights list, then create it. Check if based on the aircraft.hex only
				if(!this.trackedData.activeFlights.find(flight => (flight.hex == aircraft.hex))){

					// Generate unique-enough ID for this new flight
					const uniqueID = `${aircraft.hex}-${Date.now()}`

					// Tidy up flightname
					const flightName = (aircraft.flight ?? '').trim()

					// Create new active flight entry
					const newActiveFlight = {
						hex: aircraft.hex,
						flightName: flightName,
						lastData: requestTime,
						entries: [],
						geoJSON: {
							type: "Feature",
							properties: { // We duplicate it here, as we will copy over the geoJSON into the loggedTracks feature collection later on
								hex: aircraft.hex,
								flightName: flightName,
								firstData: requestTime,
								lastData: requestTime
							},
							geometry: {
								type: 'LineString',
								coordinates: []
							}
						},
						uniqueID: uniqueID
					}
					this.trackedData.activeFlights.push(newActiveFlight)

					// Create a new flight track
					this.addActiveFlightLayerToMap(newActiveFlight)
				}

				// Now for each active flight, update with latest data
				const flight = this.trackedData.activeFlights.find(flight => flight.hex == aircraft.hex)
				flight.entries.push({lat: aircraft.lat, lng: aircraft.lon, heading: aircraft.track, alt_baro: aircraft.alt_baro, timestamp: requestTime})
				flight.geoJSON.geometry.coordinates.push([aircraft.lon, aircraft.lat])
				flight.geoJSON.properties.lastData = requestTime
				flight.lastData = requestTime

			}
		}
	}

	// Create a new active track
	addActiveFlightLayerToMap = (newActiveFlight) => {
		this.map.addSource(newActiveFlight.uniqueID, {
			type: 'geojson',
			data: newActiveFlight.geoJSON
		})
		this.map.addLayer({
			'id': newActiveFlight.uniqueID,
			'type': 'line',
			'source': newActiveFlight.uniqueID,
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': `${this.options.styles.colours.trackActive}`,
				'line-width': 2,
				'line-blur': 0
			}
		})
	}

	// Set any active flights to inactive if we have no new data from them
	checkForCompletedFlights = () => {

		const staleFlights = this.trackedData.activeFlights.filter(flight => flight.lastData+(2*this.options.fetch.interval) < this.trackedData.lastData)

		for(let flight of staleFlights){

			// Add this to loggedTracks now
			this.trackedData.loggedTracks.geoJSON.features.push(flight.geoJSON)
			this.trackedData.loggedTracks.totalTracks++

			// Remove the layer and source from the map
			this.map.removeLayer(flight.uniqueID)
			this.map.removeSource(flight.uniqueID)

			// Remove from the activeFlights array
			const index = this.trackedData.activeFlights.indexOf(flight)
			if (index > -1) {
				this.trackedData.activeFlights.splice(index, 1)
			}

		}

		// Update loggedTracks render
		this.drawLoggedTracks()

	}

	updateStats = () => {
		this.options.dom.stats.active.innerHTML = this.trackedData.activeFlights.length
		this.options.dom.stats.incursions.innerHTML = '0'
		this.options.dom.stats.logged.innerHTML = this.trackedData.loggedTracks.totalTracks
	}


	addLoggedTracks = () => {
		this.map.addSource('loggedTracks', {
			type: 'geojson',
			data: this.trackedData.loggedTracks.geoJSON
		})
		this.map.addLayer({
			'id': 'loggedTracks',
			'type': 'line',
			'source': 'loggedTracks',
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': `${this.options.styles.colours.trackInactive}`,
				'line-width': 2,
				'line-blur': 0
			}
		})
	}

	// Updates data for logged tracks
	drawLoggedTracks = () => {
		this.map.getSource('loggedTracks').setData(this.trackedData.loggedTracks.geoJSON)
	}
	

	drawTracks = () => {

		// Clear all markers
		this.mapMarkers.forEach((marker) => marker.remove())
		this.mapMarkers = []

		let flightsToDraw = this.trackedData.activeFlights

		for(let flight of flightsToDraw){

			// Create markers dynamically on the fly
			const marker_elem = document.createElement('div')
			marker_elem.innerHTML = `<div class="marker_plane" style="transform:rotate(${flight.entries.at(-1).heading}deg)"></div>`
			marker_elem.style.width = `30px`
			marker_elem.style.height = `30px`
			if(flight.entries.at(-1).alt_baro == 'ground'){
				marker_elem.style.opacity = '0.3'
			}
			const marker = new mapboxgl.Marker(marker_elem).setLngLat([flight.entries.at(-1).lng, flight.entries.at(-1).lat]).addTo(this.map)
			this.mapMarkers.push(marker)
			
			// Update the track data
			this.map.getSource(flight.uniqueID).setData(flight.geoJSON)
		}
	}

	// **********************************************************
	// LocalStorage

	loadAPIKey = () => {
		if(!localStorage.getItem('RapidAPIKey')){		
			let RapidAPI = prompt("Enter RapidAPI key:")
			localStorage.setItem('RapidAPIKey', RapidAPI)
		}
		this.options.rapidAPI.key = localStorage.getItem('RapidAPIKey')
	}

	clearAPIKey = () => {
		localStorage.removeItem('RapidAPIKey')
		location.reload()
	}

	saveTrackedDataToStorage = (jsonData) => {
		localStorage.setItem('trackedData', JSON.stringify(jsonData))
	}

	fetchTrackedDataFromStorage = () => {
		if(localStorage.getItem('trackedData')){
			this.trackedData = JSON.parse(localStorage.getItem('trackedData'))
			// TODO: Move this bit somewhere else
			for(let flight of this.trackedData.activeFlights){
				this.addActiveFlightLayerToMap(flight)
			}
		}
	}

	clearStorageAndTracks = () => {
		localStorage.removeItem('trackedData')
		this.trackedData = {
			flights: []
		}
	}


	// **********************************************************

}