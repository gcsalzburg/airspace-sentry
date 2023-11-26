
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
		incursionTracks: {
			geoJSON: {
				type: "FeatureCollection",
				features: []
			}					
		},
		activeFlights: []
	}

	// geoJSON for the aircraft markers
	aircraftMarkers = []

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
			this.addLoggedTracks()
			this.addIncursionTracks()
			this.drawTracks()

			// Add hover effects to incursions
			this.map.on('mouseenter', 'incursionTracks', (e) => {
				// Change the cursor style as a UI indicator.
				this.map.getCanvas().style.cursor = 'pointer'
				if (e.features.length > 0) {
					const trackProperties = e.features.at(0).properties
					const durationSeconds = Math.round((trackProperties.lastData - trackProperties.firstData)/1000)
					let dataToShow = `Incursion from flight ${trackProperties.flightName} for ${durationSeconds}s`
					if(trackProperties.isActive) dataToShow += `<br>Incursion ongoing`
					this.showFlightData(dataToShow)
				}
			});
			this.map.on('mouseleave', 'incursionTracks', () => {
				this.map.getCanvas().style.cursor = ''
				this.clearFlightData()
			});


			// Start fetching data
			await this.fetchAndRender()
	
		})
	}

	// Draws a circle to show the search area for ADSB-Exchange
	// TODO: Make editable
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


	// **********************************************************

	fetchAndRender = async () => {

		// Fetch new data from ADSB and update trackedData.activeFlights with it
		await this.fetchADSB()

		// Clean up completed flights from the map
		this.checkForCompletedFlights()
		this.checkForCompletedIncursions()

		// Update localStorage
		this.saveTrackedDataToStorage(this.trackedData)

		// Update stats
		this.updateStats()

		// Render the active Tracks
		this.drawIncursionTracks()
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
		// TODO: Add better error check on this fetch
		const newFlightData = await fetch(url, options).then(response => response.json()).catch(err => console.log(err))

		if(!newFlightData) return // Fetch failed?
		if(!newFlightData.ac) return // Could be that API was unreachable 


		const requestTime = newFlightData.now // TODO: Check if this is the correct time measurement to use
		this.trackedData.lastData = requestTime

		const flights = newFlightData.ac.filter(flight => flight.alt_baro != 'ground') // Only aircraft that are in the air please

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
					intersects: false,
					entries: [],
					geoJSON: {
						type: "Feature",
						properties: { // We duplicate it here, as we will copy over the geoJSON into the loggedTracks feature collection later on
							uniqueID: uniqueID,
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
				this.addActiveFlightToMap(newActiveFlight)
			}

			// Update track with latest data
			const flight = this.trackedData.activeFlights.find(flight => flight.hex == aircraft.hex)
			flight.entries.push({lat: aircraft.lat, lng: aircraft.lon, heading: aircraft.track, alt_baro: aircraft.alt_baro, timestamp: requestTime})
			flight.geoJSON.geometry.coordinates.push([aircraft.lon, aircraft.lat])
			flight.geoJSON.properties.lastData = requestTime
			flight.lastData = requestTime

			// Check if it is inside the area!
			flight.intersects = turf.booleanPointInPolygon([aircraft.lon, aircraft.lat], this.searchPoly)

			if(flight.intersects){

				// If the incursion isn't being logged right now
				if(!this.trackedData.incursionTracks.geoJSON.features.find(track => ((track.properties.uniqueID == flight.uniqueID) && track.properties.isActive))){

					// Create new entry in incursionTracks
					const newIncursionTrackGeoJSON = {
						type: "Feature",
						properties: {
							isActive: true,
							uniqueID: flight.uniqueID,
							hex: flight.hex,
							flightName: flight.flightName,
							firstData: requestTime,
							lastData: requestTime
						},
						geometry: {
							type: 'LineString',
							coordinates: []
						}
					}
					this.trackedData.incursionTracks.geoJSON.features.push(newIncursionTrackGeoJSON)
				}

				// Update incursion track with latest data
				const incursionTrack = this.trackedData.incursionTracks.geoJSON.features.find(track => ((track.properties.uniqueID == flight.uniqueID) && track.properties.isActive))
				incursionTrack.geometry.coordinates.push([aircraft.lon, aircraft.lat])
				incursionTrack.properties.lastData = requestTime

			}else{

				// If we had one we were logging, we can stop now 
				const activeIncursionTrack = this.trackedData.incursionTracks.geoJSON.features.find(track => ((track.properties.uniqueID == flight.uniqueID) && track.properties.isActive))
				if(activeIncursionTrack){
					activeIncursionTrack.properties.isActive = false
				}

			}
		}
	}

	// TODO: Show all altitudes on hover

	// Create a new active track & marker
	addActiveFlightToMap = (newActiveFlight) => {

		// Add the new source and layer
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

	// Set any incursion tracks to inactive if we have no new data from them
	checkForCompletedIncursions = () => {

		const staleIncursions = this.trackedData.incursionTracks.geoJSON.features.filter(track => track.properties.lastData+(2*this.options.fetch.interval) < this.trackedData.lastData)

		for(let track of staleIncursions){
			track.properties.isActive = false
		}
	}

	updateStats = () => {

		// Update numbers
		this.options.dom.stats.active.innerHTML = this.trackedData.activeFlights.length
		this.options.dom.stats.incursions.innerHTML = this.trackedData.incursionTracks.geoJSON.features.length
		this.options.dom.stats.logged.innerHTML = this.trackedData.loggedTracks.totalTracks

		// Add styling for current incursion
		const incursions = this.trackedData.activeFlights.reduce((total, flight) => total | flight.intersects, false)
		this.options.dom.stats.incursions.parentNode.classList.toggle('is-incursion',incursions)
	}

	showFlightData = (data) => {
		this.options.dom.flightData.innerHTML = data
	}

	clearFlightData = () => {
		this.options.dom.flightData.innerHTML = ''
	}


	addIncursionTracks = () => {
		this.map.addSource('incursionTracks', {
			type: 'geojson',
			data: this.trackedData.incursionTracks.geoJSON
		})
		this.map.addLayer({
			'id': 'incursionTracks',
			'type': 'line',
			'source': 'incursionTracks',
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': `rgb(255,0,0)`,
				'line-width': 4,
				'line-blur': 0
			}
		})
	}

	// Updates data for logged tracks
	drawIncursionTracks = () => {
		this.map.getSource('incursionTracks').setData(this.trackedData.incursionTracks.geoJSON)
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
		this.aircraftMarkers.forEach((marker) => marker.remove())
		this.aircraftMarkers = []

		for(let flight of this.trackedData.activeFlights){

			// Create markers dynamically on the fly
			const marker_elem = document.createElement('div')
			marker_elem.innerHTML = '<i></i>'
			marker_elem.classList.add('marker_aircraft')
			if(flight.intersects) marker_elem.classList.add('is_intersect')

			// Add new marker
			const marker = new mapboxgl.Marker(marker_elem)
				.setLngLat([flight.entries.at(-1).lng, flight.entries.at(-1).lat])
				.setRotation(flight.entries.at(-1).heading)
				.addTo(this.map)

			// Save to array of markers
			this.aircraftMarkers.push(marker)

			// Add marker hover
			marker.getElement().addEventListener('mouseenter', (e) => {
				this.showFlightData(`Flight hex: ${String(flight.hex).toUpperCase()}, flight: ${flight.flightName}<br>Altitude: ${flight.entries.at(-1).alt_baro}m`)
			})
			marker.getElement().addEventListener('mouseleave', (e) => {
				this.clearFlightData()
			})
			
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
				this.addActiveFlightToMap(flight)
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