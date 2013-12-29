LIB = {
	getParams : function(url) {
		var params = {};
		url.substr(url.indexOf('?') + 1).split('&').forEach(function(param) {
			param = param.split('=');
			params[param[0]] = param[1];
		});
		return params;
	},
	renderSkin : function() {
		/* Render the layout */
		$('body').hide().empty().append(Handlebars.templates.skin({
			year : (new Date()).getFullYear(),
			version : FRAPP.version.frapp
		}));
	},
	FBLogin : function() {
		FB.login(function(response) {
			if(!response.authResponse) return;
			LIB.FBLoginCallback(response.authResponse);
		}, {scope : 'read_stream,manage_notifications'});
	},
	FBLoginCallback : function(authResponse) {
		FB.api('/me', function(user) {
			$('header div.user').html(Handlebars.partials.user(user));
		});
		LIB.getPosts();
		setTimeout(function() {
			LIB.getNotifications();
		}, 0);
	},
	logout : function() {
		FB.logout(function() {
			FRAPP.storage.clear();
			FRAPP.reload();
		});
	},
	setBrs : function() {
		$('div.data p.message').each(function(i, p) {
			p = $(p);
			$('br', p).length === 0 && p.html(p.text().replace(/\n/g, '<br>'));
			//TODO: parse links
		});
	},
	getPosts : function(update) {
		var since = parseInt(FRAPP.storage.get('since', true), 10) - 3600,
			params = { limit: 500 },
			updating = '<p class="updating">' + L.updating + '...</p>';

		since > 0 && (params.since = since);
		!update && $('section').html(updating);
		FB.api('/me/home', 'get', params, function(r) {
			var noData = {
					ids : [],
					indexes : []
				},
				store = function() {
					/* process, parse and store the data */
					var l = r.data.length,
						storedPosts = FRAPP.storage.get('posts') || [],
						addedPosts = [];

					for(var x=0; x<l; x++) {
						var p = r.data[x];
						if(p.error || storedPosts.indexOf(p.id) !== -1) {
							r.data.splice(x, 1);
							x--;
							l--;
						} else {
							/* Picture url extraction */
							if(p.picture) {
								(p.picture.indexOf('https://fbcdn-photos') === 0 || p.picture.indexOf('https://fbcdn-vthumb') === 0 || p.picture.indexOf('https://fbcdn-profile') === 0) && p.picture.indexOf('?') === -1 && p.picture.lastIndexOf('_') === p.picture.length - 6 && (p.picture = p.picture.substr(0, p.picture.length - 5) + 'n' + p.picture.substr(p.picture.length - 4));
								if(p.picture.indexOf('https://fbexternal') === 0) {
									var params = LIB.getParams(p.picture);
									params.url && (p.picture = decodeURIComponent(params.url));
									params.src && (p.picture = decodeURIComponent(params.src));
								}
							}
							/* Embeded content */
							if(p.link) {
								(p.link.indexOf('http://soundcloud.com') === 0 || p.link.indexOf('https://soundcloud.com') === 0) && (p.soundcloud = true);
								if(p.link.indexOf('http://www.youtube.com') === 0 || p.link.indexOf('https://www.youtube.com') === 0) {
									var params = LIB.getParams(p.link);
									params.v && (p.youtube = params.v);
								}
								(p.link.indexOf('http://youtu.be/') === 0 || p.link.indexOf('https://youtu.be/') === 0) && (p.youtube = p.link.substr(p.link.lastIndexOf('/') + 1));
							}

							/* store post on storage */
							var data = { from : p.from };
							p.message && (data.message = p.message);
							p.name && (data.name = p.name);
							p.description && (data.description = p.description);
							p.picture && (data.picture = p.picture);
							p.link && (data.link = p.link);
							p.soundcloud && (data.soundcloud = p.soundcloud);
							p.youtube && (data.youtube = p.youtube);
							p.comments && (data.comments = p.comments);
							p.actions && (data.actions = p.actions);
							FRAPP.storage.set('post:' + p.id, data);
							addedPosts.push(p.id);
						}
					}
					/* store posts index on storage */
					addedPosts.length && FRAPP.storage.set('posts', addedPosts.concat(storedPosts));
					
					/* store since date on storage */
					if(r.paging && r.paging.previous) {
						var params = LIB.getParams(r.paging.previous);
						params.since && FRAPP.storage.set('since', parseInt(params.since, 10), true);    
					}
					
					if(update) {
						var fp = $('section div.post').first();
						r.data.forEach(function(p) {
							fp.before(Handlebars.partials.post(FRAPP.storage.get('post:' + p.id)));
						});
						LIB.setBrs();
						$('header div.user span.updating i').stop().fadeOut(400, function() {
							$(this).parent.hide();
						});
					} else LIB.renderPosts();
				};

			r.data.forEach(function(p, i) {
				//check for posts with missing data
				if(p.message || p.picture || p.link) return;
				noData.ids.push(p.id);
				noData.indexes.push(i);
			});

			if(!noData.ids.length) return store();
			FB.api('/?ids=' + noData.ids.join(','), function(data) {
				noData.ids.forEach(function(id, i) {
					i = noData.indexes[i];
					if(data[id] && (data[id].message || data[id].picture || data[id].link)) r.data[i] = data[id];
					else r.data[i].error = true;
				});
				store();
			});
		});
	},
	renderPosts : function() {
		//render inital posts set
		var posts = FRAPP.storage.get('posts') || [],
			w = $(window),
			doc = $(document),
			pageSize = 10,
			postIndex = pageSize;
		
		postIndex >= posts.length && (postIndex = posts.length - 1);
		$('section').empty();
		for(var x=0; x<postIndex; x++) $('section').append(Handlebars.partials.post(FRAPP.storage.get('post:' + posts[x])));

		//get previous content on scroll
		var onScroll = function() {
				var bt = (doc.height() - w.height()) * 0.8;
				if(bt < 200 || w.scrollTop() > bt) {
					if(postIndex >= posts.length -1) {
						w.unbind('scroll', onScroll);
						delete LIB.onScroll;
						return;
					}
					var to = postIndex + pageSize;
					to >= posts.length && (to = posts.length - 1);
					for(var x=postIndex; x<to; x++) {
						$('section').append(Handlebars.partials.post(FRAPP.storage.get('post:' + posts[x])));
					}
					LIB.setBrs();
					postIndex = to;
				}
			};

		LIB.onScroll && w.unbind('scroll', LIB.onScroll);
		LIB.onScroll = onScroll;
		w.bind('scroll', onScroll);
		LIB.setBrs();
	},
	getNotifications : function() {
		FB.api('/me/notifications', function(r) {
			var n = $('header div.user a.notifications');
			if(r.summary.unseen_count) n.text(r.summary.unseen_count).show();
			else n.hide();
			n = $('header div.user div.notifications');
			if(r.data.length) {
				n.empty().show();
				r.data.forEach(function(d) {
					n.append(Handlebars.partials.notification(d));
				});
			} else n.hide();
			window.document.title = (r.summary.unseen_count ? '(' + r.summary.unseen_count + ') ' : '') + 'FrappFB';
		});
	},
	clickNotification : function(e) {
		var n = $('header div.user a.notifications'),
			c = parseInt(n.text(), 10) - 1;

		if(c > 0) n.text(c);
		else n.hide();
		$(e.target).parents('li').first().remove();
		$('header div.user div.notifications li').length === 0 && $('header div.user div.notifications').hide();
		window.document.title = (c > 0 ? '(' + c + ') ' : '') + 'FrappFB';
	},
	update : function() {
		var i = $('header div.user span.updating i'),
			a = 1,
			animate = function() {
				i.fadeTo(400, a, function() {
					a = a === 1 ? 0 : 1;
					animate();
				}); 
			};

		i.stop().css('opacity', 0).parent().show();
		animate();

		LIB.getPosts(true);
		LIB.getNotifications();
		LIB.resetUpdateTimeout();
	},
	resetUpdateTimeout : function() {
		clearTimeout(LIB.updateTimeout);
		LIB.updateTimeout = setTimeout(function() {
			LIB.update();
		}, 120000);
	},
	nightMode : function(active) {
		$('body')[(active ? 'add' : 'remove') + 'Class']('night');
		if(active) FRAPP.storage.set('nightMode', 1, true);
		else FRAPP.storage.remove('nightMode');
	}
};

window.addEventListener('frapp.init', function() {
	/* Render the skin */
	LIB.renderSkin();

	/* Night mode preference (this could maybe be based on time, later) */
	LIB.nightMode(FRAPP.storage.get('nightMode', true));

	/* onResize handler */
	var onResize = function() {
			$('section').css('minHeight', $(window).height() - 89);
		};

	onResize();
	$(window).resize(onResize);

	/* Online handler */
	var onOnline = function() {
			if(navigator.onLine === false) {
				$('header div.user').empty();
				LIB.renderPosts();
				$('body').fadeIn('fast');
			} else if(navigator.onLine === true) FRAPP.reload();
		};

	$(window).bind('online', onOnline);
	$(window).bind('offline', onOnline);
	navigator.onLine === false && onOnline();

	/* Init FB */
	$('body').append('<div id="fb-root"></div>');
	window.fbAsyncInit = function() {
		FB.init({
			appId : '685885878111468'
		});
		FB.getLoginStatus(function(response){
			if(!response.authResponse) $('section').html(Handlebars.templates.unauth());
			else LIB.FBLoginCallback(response.authResponse); 
			$('body').fadeIn('fast');
			
			/* auto-update interval & handler */
			LIB.resetUpdateTimeout();
			$(window).mousemove(function() {
				LIB.resetUpdateTimeout();
			});
		});
	};
	$.getScript('//connect.facebook.net/' + (L.lang === 'es' ? 'es_ES' : 'en_US') + '/all.js');
});
