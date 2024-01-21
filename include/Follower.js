
export default class{
 
	// Default options are below
	options = {
	}

	saved = {
		text: null,
		style: null
	}

	// **********************************************************
	// Constructor, to merge in options
	constructor(options){
		this.options = {...this.options, ...options}

		// Insert the follower HTML
		document.body.insertAdjacentHTML('beforeend','<div class="mouse-follower"><span class="text"></span></div>')
		this.container = document.querySelector('.mouse-follower')

		// Start following
		document.addEventListener('mousemove', (e) => {
			this.container.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`         
	  })
	}

	// **********************************************************
	// Set / clear content

	set = (text, options = {}) => {

		// If we should save this one
		if(options.save){
			this.saved.text = text
			this.saved.style = options.style
		}

		this.container.querySelector('span').innerHTML = text
		this.container.classList.add('is-visible')

		if(options.style){
			this.container.classList.add('has-border')
			this.container.querySelector('span').style.borderTopColor = this.options.styles[options.style]
		}
	}

	clear = () => {
		this.container.classList.remove('is-visible')
		this.container.classList.remove('has-border')
	}

	restoreSaved = () => {
		if(this.saved.text){
			this.set(this.saved.text, {
				style: this.saved.style
			})
		}else{
			this.clear()
		}
	}
}