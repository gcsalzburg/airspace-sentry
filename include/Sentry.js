
export default class{
	
	// Master object that contains all the data we've tracked
	trackedData = {
		lastData: 0,
		loggedTracks: {
			type: "FeatureCollection",
			features: []					
		},
		incursionTracks: {
			type: "FeatureCollection",
			features: []				
		},
		activeFlights: {
			type: "FeatureCollection",
			features: []				
		}
	}

	// geoJSON for the aircraft markers
	aircraftMarkers = []

	// Mapbox map object
	map = null

	// Search area for ADSB
	searchCircle = null

	// Search area for incursions
	incursionArea = null
	
	// References for currently active hover element
	hoveredIncursionTrack = null
	isHoveredIncursionArea = false
	hoveredIncursionArea = null

	// Ratio
	metreToNmRatio = 0.0005399568 // 1m = x nautical miles
 
	// Default options are below
	options = {
		debug: false,
		zoom: 9,
		search: {
			centre: {
				lng: -1.966238,
				lat: 55.055068,
			},
			radius: 38000, // best = 38000
			editable: false
		},
		intersect_area: '/data/tda.geojson',
		rapidAPI: {
			key: '',
			host: 'adsbexchange-com1.p.rapidapi.com'
		},
		mapbox_token: '',
		mapbox_style: 'mapbox://styles/gcsalzburg/clrnxqdbb005f01plh2c9fe1p',
		fetch: {
			interval: 5,
			nextFetch: 0
		},
		styles: {
			colours: {
				incursionArea: '#94a400',
				trackIncursion: '#ffd418',
				trackIncursionHover: '#ff6520',

				searchArea: 'rgb(145, 201, 239)',
				trackActive: 'rgb(128, 245, 173)',
				trackInactive: 'rgba(255, 255, 255 ,0.3)'
			}
		}
	}

	// **********************************************************
	// Constructor, to merge in options
	constructor(options){

		// TODO: Make this a deep merge
		this.options = {...this.options, ...options}

		// Helper for when we want to debug
		if(this.options.debug){
			this.options.search.radius = 150000
			this.options.zoom = 7
			this.options.fetch.interval = 2
		}

		// Load RapidAPI Key
		this.loadAPIKey()

		// Load search area data
		this.loadSearchArea()

		// Load Mapbox Map
		this.initSentry()
	}

	// **********************************************************
	// Start the Sentry
	initSentry = async () => {

		// Load the Mapbox map
		this.map = new mapboxgl.Map({
			accessToken: this.options.mapbox_token,
			container: this.options.dom.mapbox,
			style: this.options.mapbox_style, // TODO: Reduce dominance of underlying roads
			center: [this.options.search.centre.lng, this.options.search.centre.lat],
			zoom: this.options.zoom,
		})

		// Load in search area polygon from file
		this.incursionArea = await fetch(this.options.intersect_area).then(response => response.json()).catch(err => `Error loading incursion area: ${err}`)
		this.isIncursionAreaWithHeights()

		// Once the map has loaded
		this.map.on('load', async () => {

			this.fetchTrackedDataFromStorage()	// Load previously saved data from memory
			this.initMapGeoJSONLayers()			// Add the geoJSON layers up front
			this.renderActiveFlights()				// Draw existing data from storage
			await this.fetchAndRender()			// Start fetching data
	
		})
	}
	
	// The main fetch & render loop
	fetchAndRender = async (oneOffForce = false) => {

		// Fetch new data from ADSB and update trackedData.activeFlights with it
		await this.fetchADSB()

		// Clean up completed flights from the map
		this.checkForCompletedFlights()
		this.checkForCompletedIncursions()

		// Update localStorage
		this.saveTrackedDataToStorage(this.trackedData)

		// Render the active Tracks
		this.updateDataSource('incursionTracks',this.trackedData.incursionTracks)
		this.renderActiveFlights()

		// Render the stats
		this.renderStats()

		// Fetch again!
		if(!oneOffForce){
			setTimeout(() => {
				this.fetchAndRender()
			}, this.options.fetch.interval*1000)
			this.options.fetch.nextFetch = Date.now()/1000 + this.options.fetch.interval
		}
	}

	// **********************************************************
	// Draw all the layers onto the map
	initMapGeoJSONLayers = () => {

		// [0] Add the circle to show the search area for ADSB-Exchange
		// Uses: https://github.com/smithmicro/mapbox-gl-circle/
		this.drawSearchAreaCircle(this.options.search.editable)

		// [1] Add the incursionArea layer
		this.map.addSource('incursionArea', {'type':'geojson', 'data':this.incursionArea, 'promoteId': "title"})
		this.map.addLayer({
			'id': 'incursionArea',
			'type': 'fill',
			'source': 'incursionArea',
			'layout': {},
			'paint': {
				'fill-color': `${this.options.styles.colours.incursionArea}`,
				'fill-opacity': [
					'case',
					['boolean', ['feature-state', 'hover'], false],
					0.85,
					0.55
				]		
			}
		})

		this.map.on('mousemove', 'incursionArea', (e) => {
			this.map.getCanvas().style.cursor = 'pointer'
			if (e.features.length > 0) {
				if(e.features.at(0).properties.height){
					const heights = JSON.parse(e.features.at(0).properties.height)
					this.options.follower.set(`${e.features.at(0).properties.title}<br>${heights.min} - ${heights.max}m`, {style: 'incursion', save: true})
					this.isHoveredIncursionArea = true
				}

				if(this.hoveredIncursionArea !== null){
					this.map.setFeatureState(
						{source:'incursionArea', id: this.hoveredIncursionArea},
						{hover:false}
					)
				}
				this.hoveredIncursionArea = e.features.at(0).id;
				this.map.setFeatureState(
					{source:'incursionArea', id: this.hoveredIncursionArea},
					{hover:true}
				)
			}
		})
		this.map.on('mouseleave', 'incursionArea', () => {
			// Clear hover effect
			this.map.getCanvas().style.cursor = ''
			this.options.follower.clear()
			this.isHoveredIncursionArea = false

			if(this.hoveredIncursionArea !== null){
				this.map.setFeatureState(
					{source:'incursionArea', id: this.hoveredIncursionArea},
					{hover:false}
				)
			}
			this.hoveredIncursionArea = null
		})
		

		// [2] Add logged tracks
		this.map.addSource('loggedTracks', {type:'geojson', data:this.trackedData.loggedTracks, 'promoteId': "id"})
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
				'line-width': 1,
				'line-blur': 3
			}
		})

		// [3] Add any active tracks (that must have been restored)
		for(let flight of this.trackedData.activeFlights.features){
			this.addActiveFlightToMap(flight)
		}

		// [4] Add incursion tracks
		this.map.addSource('incursionTracks', {type:'geojson', data: this.trackedData.incursionTracks, 'promoteId': "id"})
		this.map.addLayer({
			'id': 'incursionTracks',
			'type': 'line',
			'source': 'incursionTracks',
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				//'line-color': this.options.styles.colours.trackIncursion,
				'line-color': [
					'case',
					['boolean', ['feature-state', 'hover'], false],
					this.options.styles.colours.trackIncursionHover,
					this.options.styles.colours.trackIncursion
				],
				'line-width': [
					'case',
					['boolean', ['feature-state', 'hover'], false],
					6,
					2
				],
				'line-blur': 0
			}
		})

		// Add hover effects
		// Add hover effects to incursion tracks
		this.map.on('mousemove', 'incursionTracks', (e) => {
			this.map.getCanvas().style.cursor = 'pointer'
			if (e.features.length > 0) {

				// Higlight the hovered one
				if (this.hoveredIncursionTrack !== null) {
					this.map.setFeatureState(
						{source: 'incursionTracks', id: this.hoveredIncursionTrack},
						{hover: false}
					)
				}
				this.hoveredIncursionTrack = e.features[0].id;
				this.map.setFeatureState(
					{source: 'incursionTracks', id: this.hoveredIncursionTrack},
					{hover: true}
				)

				const trackProperties = e.features.at(0).properties
				const durationSeconds = Math.round((trackProperties.lastData - trackProperties.firstData)/1000)
				const altitudes = JSON.parse(trackProperties.altitude)
				this.options.follower.set(`Incursion from flight ${trackProperties.flightName} for ${durationSeconds}s<br>(${altitudes.min}-${altitudes.max}m)`, {style: 'incursionTrack'})
			}
		})
		this.map.on('mouseleave', 'incursionTracks', () => {
			// Clear hover effect
			if (this.hoveredIncursionTrack !== null) {
				this.map.setFeatureState(
					{source: 'incursionTracks', id: this.hoveredIncursionTrack},
					{hover: false}
				)
			}
			this.hoveredIncursionTrack = null

			// If we are still in an incursion area, then go back to the previous saved setup
			if(this.isHoveredIncursionArea){
				this.options.follower.restoreSaved()
			}else{
				this.map.getCanvas().style.cursor = 'pointer'
				this.options.follower.clear()
			}
		})

	}

	
	// **********************************************************
	// Create the search area circle
	// Uses: https://github.com/smithmicro/mapbox-gl-circle/

	// Show/hide the search area visual
	toggleSearchCircle = () => {
		this.options.search.editable = !this.options.search.editable
		this.saveSearchArea()
		this.drawSearchAreaCircle(this.options.search.editable)
	}

	// Draw the search area circle on the screen
	drawSearchAreaCircle = (isEditable = true, isVisible = true) => {

		if(this.searchCircle){
			this.searchCircle.remove()
		}

		if(!isVisible) return

		const searchOptions = {
			editable: isEditable,
			fillColor: `${this.options.styles.colours.searchArea}`,
			fillOpacity: 0,
			strokeWeight: 0,
			strokeColor: 'rgb(255,255,255)',
			strokeOpacity: 0.3,
			maxRadius: 250/this.metreToNmRatio
		}

		if(isEditable){
			searchOptions.strokeWeight = 1
			searchOptions.fillOpacity = 0.05
		}

		this.searchCircle = new MapboxCircle({lat: this.options.search.centre.lat, lng: this.options.search.centre.lng}, this.options.search.radius, searchOptions)
		
		if(this.map.getLayer('incursionArea')){
			this.searchCircle.addTo(this.map, 'incursionArea')
		}else{
			this.searchCircle.addTo(this.map)
		}

		this.searchCircle.on('centerchanged', (circleObj) => {
			const newCentre = circleObj.getCenter()
			this.options.search.centre.lat = newCentre.lat
			this.options.search.centre.lng = newCentre.lng

			// Save changes to localStorage
			this.saveSearchArea()
			
			// Immediately call to update aircraft in view
			this.fetchAndRender(true)
		})
		this.searchCircle.on('radiuschanged', (circleObj) => {
			try{
				// We need a try/catch here to avoid a bug when you hover over an aircraft whilst dragging

				this.options.search.radius = circleObj.getRadius()

				// Save changes to localStorage
				this.saveSearchArea()

				// Immediately call to update aircraft in view
				this.fetchAndRender(true)
			}catch{
				
			}
		})
	}

	// **********************************************************
	// Create a new layer for the active flight on it
	addActiveFlightToMap = (flight) => {

		// Create the track
		this.map.addSource(flight.properties.id, {type:'geojson', data:flight})
		this.map.addLayer({
			'id': flight.properties.id,
			'type': 'line',
			'source': flight.properties.id,
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': `${this.options.styles.colours.trackActive}`,
				'line-width': 1,
				'line-blur': 0
			}
		})

		// Create the marker
		const marker_elem = document.createElement('div')
		marker_elem.id = flight.properties.id
		marker_elem.innerHTML = '<i></i>'
		marker_elem.classList.add('marker_aircraft')
		marker_elem.classList.toggle('is_intersect', flight.properties.intersects)

		// Add new marker
		const marker = new mapboxgl.Marker({element: marker_elem}).setLngLat([0,0]).addTo(this.map)

		// Set co-ordinates, assuming we have some already
		if(flight.geometry.coordinates.length > 0){
			marker.setLngLat([flight.geometry.coordinates.at(-1)[0], flight.geometry.coordinates.at(-1)[1]])
			marker.setRotation(flight.properties.heading)
		}

		// Save to array of markers
		this.aircraftMarkers.push(marker)

		// Add marker hover
		marker.getElement().addEventListener('mouseenter', (e) => {
			this.options.follower.set(`${flight.properties.flightName} (${String(flight.properties.hex).toUpperCase()}) - ${flight.geometry.coordinates.at(-1)[2]}m`)
		})
		marker.getElement().addEventListener('mouseleave', (e) => {
			this.options.follower.clear()
		})
	}

	// **********************************************************
	// Fetch data
	// Grab new update of data from ADSB Exchange via RapidAPI

	fetchADSB = async () => {

		// Fetch data from ADSB Exchange
		const url = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${this.options.search.centre.lat}/lon/${this.options.search.centre.lng}/dist/${this.options.search.radius * this.metreToNmRatio}/`;
		const options = {
			method: 'GET',
			headers: {
				'X-RapidAPI-Key': this.options.rapidAPI.key,
				'X-RapidAPI-Host': this.options.rapidAPI.host
			}
		}
		const newFlightData = await fetch(url, options).then(response => response.json()).catch(err => console.log(err))

		if(!newFlightData) return // Fetch failed?
		if(!newFlightData.ac) return // Could be that API was unreachable 

		const requestTime = newFlightData.now // TODO: Check if this is the correct time measurement to use
		this.trackedData.lastData = requestTime

		const aircrafts = newFlightData.ac.filter(aircraft => aircraft.alt_baro != 'ground') // Only aircraft that are in the air please

		// Iterate over each new aircraft
		for(let aircraft of aircrafts){

			// If it doesn't exist in the activeFlights list, then create it. Check if based on the aircraft.hex only
			if(!this.trackedData.activeFlights.features.find(flight => (flight.properties.hex == aircraft.hex))){

				// Generate unique-enough ID for this new flight
				const uniqueID = `${aircraft.hex}-${Date.now()}`

				// Tidy up flightname
				const flightName = (aircraft.flight ?? '').trim()

				// Create new active flight geoJSON feature line
				const newActiveFlight = {
					type: "Feature",
					properties: {
						id: uniqueID,
						hex: aircraft.hex,
						flightName: flightName,
						firstData: requestTime,
						lastData: requestTime,
						intersects: false
					},
					geometry: {
						type: 'LineString',
						coordinates: []
					}
				}
				this.trackedData.activeFlights.features.push(newActiveFlight)

				// Create a new flight track
				this.addActiveFlightToMap(newActiveFlight)
			}

			// Update track with latest data
			const flight = this.trackedData.activeFlights.features.find(flight => flight.properties.hex == aircraft.hex)
			flight.geometry.coordinates.push([aircraft.lon, aircraft.lat, aircraft.alt_baro])
			flight.properties.heading = aircraft.track
			flight.properties.lastData = requestTime

			// Check if it is inside the area

			if(this.isPointIncursion([aircraft.lon, aircraft.lat], this.incursionArea, aircraft.alt_baro)){

				// If the incursion isn't being logged right now
				if(!this.trackedData.incursionTracks.features.find(track => ((track.properties.id == flight.properties.id) && track.properties.isIncursionOngoing))){

					// Clone the flight, and remove the coordinates
					const newIncursionTrackGeoJSON = structuredClone(flight)
					newIncursionTrackGeoJSON.geometry.coordinates = []
					newIncursionTrackGeoJSON.properties.isIncursionOngoing = true
					newIncursionTrackGeoJSON.properties.firstData = requestTime
					newIncursionTrackGeoJSON.properties.altitude = {min: 999999999999999, max: 0}

					// Add it to the incursionTracks
					this.trackedData.incursionTracks.features.push(newIncursionTrackGeoJSON)
				}

				// Update incursion track with latest data
				const incursionTrack = this.trackedData.incursionTracks.features.find(track => ((track.properties.id == flight.properties.id) && track.properties.isIncursionOngoing))
				incursionTrack.geometry.coordinates.push([aircraft.lon, aircraft.lat])
				incursionTrack.properties.altitude.min = Math.min(aircraft.alt_baro, incursionTrack.properties.altitude.min)
				incursionTrack.properties.altitude.max = Math.max(aircraft.alt_baro, incursionTrack.properties.altitude.max)
				incursionTrack.properties.lastData = requestTime

			}else{

				// If we had one we were logging, we can stop now 
				const activeIncursionTrack = this.trackedData.incursionTracks.features.find(track => ((track.properties.id == flight.properties.id) && track.properties.isIncursionOngoing))
				if(activeIncursionTrack){
					activeIncursionTrack.properties.isIncursionOngoing = false
				}

			}
		}
	}

	// **********************************************************
	// Incursion area checks

	// Checks if the point is inside the incursion area
	isPointIncursion = (latlng, area, height = -1) => {

		if(area.type == 'FeatureCollection'){
			// Multiple areas to check
			for(let feature of area.features){
				if(this._isPointIncursion(latlng, feature, height)){
					return true
				}
			}

		}else if (area.type == 'Feature'){
			// Single area
			return this._isPointIncursion(latlng, area, height)
		}

		return false
	}
	
	_isPointIncursion = (latlng, feature, height) => {
		if(turf.booleanPointInPolygon(latlng, feature)){
			if((height >= 0) && this._checkForHeight(feature)){
				if((height >= feature.properties.height.min) && (height <= feature.properties.height.max)){
					return true
				}
			}
		}
		return false
	}



	isIncursionAreaWithHeights = () => {
				
		if(this.incursionArea.type == 'FeatureCollection'){
			// Multiple areas to check
			for(let feature of this.incursionArea.features){

				if(!this._checkForHeight(feature)) return false
			}

		}else if (this.incursionArea.type == 'Feature'){
			// Single area
			return this._checkForHeight(this.incursionArea)
		}
	}

	_checkForHeight = (feature) => {
		if(feature.properties.height){
			// TODO Add proper height validity check here
			return true
		}
		console.log(`No height found for 1+ incursion region (${feature.properties.title})). Incursions may be calculated without heights.`)
	}


	// **********************************************************
	// Checks after new data has been retrieved

	// Set any active flights to inactive if we have no new data from them
	checkForCompletedFlights = () => {

		const staleFlights = this.trackedData.activeFlights.features.filter(flight => flight.properties.lastData+(2*this.options.fetch.interval) < this.trackedData.lastData)

		for(let flight of staleFlights){

			// Reduce the size of the tracked data to save on localStorage
			flight.geometry.coordinates = this._everyNthElement(flight.geometry.coordinates, 10)

			// Add this to loggedTracks now
			this.trackedData.loggedTracks.features.push(flight)

			// Remove the layer and source from the map
			this.map.removeLayer(flight.properties.id)
			this.map.removeSource(flight.properties.id)

			// Remove from the activeFlights array
			let index = this.trackedData.activeFlights.features.indexOf(flight)
			if (index > -1) {
				this.trackedData.activeFlights.features.splice(index, 1)
			}

			// Remove the marker
			const marker = this.aircraftMarkers.find(marker => marker._element.id == flight.properties.id)
			marker.remove()
			index = this.aircraftMarkers.indexOf(marker)
			if (index > -1){
				this.aircraftMarkers.splice(index, 1)
			}

		}

		// Update loggedTracks render
		this.updateDataSource('loggedTracks',this.trackedData.loggedTracks)

	}

	// Set any incursion tracks to inactive if we have no new data from them
	checkForCompletedIncursions = () => {

		const staleIncursions = this.trackedData.incursionTracks.features.filter(track => (track.properties.isIncursionOngoing && track.properties.lastData+(2*this.options.fetch.interval) < this.trackedData.lastData))

		for(let track of staleIncursions){
			track.properties.isIncursionOngoing = false
		}
	}

	// **********************************************************
	// Update loops

	// Update the data source for a set of map data, such as the inclusion tracks or the logged tracks
	updateDataSource = (source, dataset) => {
		this.map.getSource(source).setData(dataset)
	}
	
	// Remove and re-add all plane markers
	renderActiveFlights = () => {
		for(let flight of this.trackedData.activeFlights.features){
			// Update the marker
			const marker = this.aircraftMarkers.find(marker => marker._element.id == flight.properties.id)
			marker.setLngLat([flight.geometry.coordinates.at(-1)[0], flight.geometry.coordinates.at(-1)[1]])
			marker.setRotation(flight.properties.heading)
			marker._element.classList.toggle('is_intersect', flight.properties.intersects)
		
			// Update the track data
			this.updateDataSource(flight.properties.id, flight)
		}
	}

	// **********************************************************
	// Rendering metadata to the screen
	
	renderStats = () => {

		// Update numbers
		this.options.dom.stats.active.innerHTML = this.trackedData.activeFlights.features.length
		this.options.dom.stats.incursions.innerHTML = this.trackedData.incursionTracks.features.length
		this.options.dom.stats.logged.innerHTML = this.trackedData.loggedTracks.features.length

		// Add styling for current incursion
		const incursions = this.trackedData.incursionTracks.features.reduce((total, flight) => total | flight.properties.isIncursionOngoing, false)
		this.options.dom.stats.incursions.parentNode.classList.toggle('is-incursion', incursions)
	}

	// **********************************************************
	// LocalStorage save/restore for API key and tracked data

	getAllDataAsGeoJSON = () => {

		// Splice all data into one big GeoJSON FeatureCollection
		const trackedData = structuredClone(this.trackedData)

		// Create container for aircraft
		trackedData.aircraft = {
			type: "FeatureCollection",
			features: []					
		}

		// Add a tag so when we combine everything into one featurecollection we can distinguish them
		for(let feature of trackedData.incursionTracks.features){
			feature.properties.trackType = 'incursion'
		}
		for(let feature of trackedData.loggedTracks.features){
			feature.properties.trackType = 'logged'
		}
		for(let feature of trackedData.activeFlights.features){
			feature.properties.trackType = 'active'

			// Create some geoJSON points for the aircraft
			trackedData.aircraft.features.push({
				"type": "Feature",
				"geometry": {
				  "type": "Point",
				  "coordinates": [feature.geometry.coordinates.at(-1)[0], feature.geometry.coordinates.at(-1)[1]]
				},
				"properties": {
				  "flightName": feature.properties.flightName,
				  "heading": feature.properties.heading,
				  "hex": feature.properties.hex,
				  "id": `${feature.properties.id}-aircraft`
				}
			 })
		}

		// Now add the incursion region
		if(this.incursionArea.type == 'FeatureCollection'){
			trackedData.incursionArea = structuredClone(this.incursionArea)
		}else if (this.incursionArea.type == 'Feature'){
			trackedData.incursionArea = {
				type: "FeatureCollection",
				features: [structuredClone(this.incursionArea)]					
			}
		}

		// Finally add search area centre and radius
		const searchAreaCentre = {
			"type": "Feature",
			"geometry": {
			"type": "Point",
				"coordinates": [this.options.search.centre.lng, this.options.search.centre.lat]
			},
			"properties": {
				"name": "searchArea-centre"
			}
		}

		const searchAreaRadius = turf.transformTranslate(searchAreaCentre, this.options.search.radius/1000, 0)
		searchAreaRadius.properties.name = "searchArea-radius"

		// Return everything
		return {
			"type": "FeatureCollection",
			"features": [
				searchAreaCentre,
				searchAreaRadius,
				...trackedData.incursionArea.features,
				...trackedData.incursionTracks.features,
				...trackedData.loggedTracks.features,
				...trackedData.activeFlights.features,
				...trackedData.aircraft.features,
			]
		}
	}

	// **********************************************************
	// LocalStorage save/restore for API key and tracked data

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
		}
	}

	clearTracks = () => {
		localStorage.removeItem('trackedData')
		location.reload()
	}

	saveSearchArea = () => {
		localStorage.setItem('searchArea', JSON.stringify(this.options.search))
	}
	loadSearchArea = () => {
		if(localStorage.getItem('searchArea')){	
			const searchArea = JSON.parse(localStorage.getItem('searchArea'))
			this.options.search = {...this.options.search, ...searchArea}
		}
	}

	// **********************************************************
	// Helpers

	// Thin array, removing all but every nth element
	_everyNthElement = (array, nth = 10) => {
		return array.filter((_, i) => (i % nth) === 0)
	}

}