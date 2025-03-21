'use strict'

import Follower from './Follower.js'
import Sentry from './Sentry.js'


document.addEventListener("DOMContentLoaded", async () => {

	// **********************************************************
	// Create new Sentry object

	const	sentry = new Sentry({
		follower: new Follower({
			styles: {
				incursion: '#ffd418',
				incursionTrack: '#ff6520'
			}
		}),
		mapbox_token: 'pk.eyJ1IjoiZ2NzYWx6YnVyZyIsImEiOiJjam1pNm5uZmcwMXNyM3FtNGp6dTY3MGxsIn0.PmLPkI3T8UxjEIPnz7fxEA',
		intersect_area: './data/london-10km-square.geojson',
		dom: {
			mapbox: document.querySelector('.map'),
			flightData: document.querySelector('.flight-data'),
			stats: {
				active: 		document.querySelector('.stat-active'),
				incursions: document.querySelector('.stat-incursions'),
				logged: 		document.querySelector('.stat-logged')
			}
		}		
	})

	// **********************************************************
	// Update countdown in the corner

	setInterval(() => {
		if(sentry.options.fetch.nextFetch){
			const percentProgress = 1- Math.max(0,(sentry.options.fetch.nextFetch - Date.now()/1000)/sentry.options.fetch.interval)
			document.querySelector('.progress-line').style.width = `${percentProgress*100}%`
	}
	},25)

	// **********************************************************
	// Handle buttons

	document.querySelectorAll('.options a, .tab-menu a').forEach(link => link.addEventListener('click', async (e) => {
		e.preventDefault()

		// Get the hash, to work out what sort of switch it is
		const url_target = link.href
		if(!url_target) return
		const hash = url_target.substring(url_target.indexOf('#') + 1)

		switch(hash){

			case 'map-view':
				document.body.dataset.view = 'map'
				break

			case 'timeline-view':
				document.body.dataset.view = 'timeline'
				break

			case 'reset-storage':
				sentry.resetStorage()
				break
			case 'clear-api-key':
				sentry.clearAPIKey()
				break
			case 'export-geojson':
				exportGeoJSON(sentry.getAllDataAsGeoJSON())
				break
			case 'toggle-options':
				document.querySelector('.options').classList.toggle('is-expanded')
				break
			case 'toggle-search-area-editing':
				sentry.toggleSearchCircle()
				break

		}
	}))

	// Add hover status effects
	document.querySelectorAll('.hover-status').forEach(hover => hover.addEventListener('mouseover', async (e) => {
		if(!hover.dataset.hoverStatus) return
		document.querySelector('.status-bar').innerHTML = hover.dataset.hoverStatus
	}))
	document.querySelectorAll('.hover-status').forEach(hover => hover.addEventListener('mouseout', async (e) => {
		document.querySelector('.status-bar').innerHTML = ''
	}))

	const exportGeoJSON = (geojson) => {

		// Generate human readable JSON file with: https://futurestud.io/tutorials/node-js-human-readable-json-stringify-with-spaces-and-line-breaks 
		// Trigger download

		const helper_link = document.createElement('a')
		helper_link.href = `data:application/geo+json;charset=utf-8,${encodeURI(JSON.stringify(geojson, null, 2))}`
		helper_link.target = '_blank'
		helper_link.download = `airspace-sentry-${Math.round(Date.now()/1000)}.geojson`
		helper_link.click()
	}
/*
	const drawSVG = () => {

		const draw = SVG().addTo('.graph').size('100%', '100%')

		const graph_inset = 50
		const graph_w = draw.node.getBoundingClientRect().width - graph_inset
		const graph_h = draw.node.getBoundingClientRect().height - graph_inset
		const graph_x0 = graph_inset
		const graph_y0 = 0 

		// Draw background
		draw.rect(graph_w, graph_h).attr({ fill: '#000' }).move(graph_x0, graph_y0)
		draw.line(graph_x0, graph_y0, graph_x0, graph_h).stroke({ width: 1, color: '#fff' })
		draw.line(graph_x0, graph_h, graph_w + graph_inset, graph_h).stroke({ width: 1, color: '#fff' })

		draw.text('0m').fill('#fff').font({size:12}).move(0, graph_h)
		draw.text('40000m').fill('#fff').font({size:12}).move(0, 0)
	}

	drawSVG()*/
})