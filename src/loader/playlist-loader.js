/*
 * playlist loader
 *
 */

import Event                from '../events';
import observer             from '../observer';
import {logger}             from '../utils/logger';

 class PlaylistLoader {

  constructor() {
    this.manifestLoaded = false;
  }

  destroy() {
    if(this.xhr &&this.xhr.readyState !== 4) {
      this.xhr.abort();
      this.xhr = null;
    }
    this.url = this.id = null;
    this.manifestLoaded = false;
  }

  load(url,request_id) {
    this.url = url;
    this.id = request_id;
    this.stats = { trequest : Date.now()};
    var xhr = this.xhr = new XMLHttpRequest();
    xhr.onload=  this.loadsuccess.bind(this);
    xhr.onerror = this.loaderror.bind(this);
    xhr.onprogress = this.loadprogress.bind(this);
    xhr.open('GET', url, true);
    xhr.send();
  }

  resolve(url, baseUrl) {
    var doc      = document,
        oldBase = doc.getElementsByTagName('base')[0],
        oldHref = oldBase && oldBase.href,
        docHead = doc.head || doc.getElementsByTagName('head')[0],
        ourBase = oldBase || docHead.appendChild(doc.createElement('base')),
        resolver = doc.createElement('a'),
        resolvedUrl;

    ourBase.href = baseUrl;
    resolver.href = url;
    resolvedUrl  = resolver.href; // browser magic at work here

    if (oldBase) {oldBase.href = oldHref;}
    else {docHead.removeChild(ourBase);}
    return resolvedUrl;
  }

  parseMasterPlaylist(string,baseurl) {
    var levels = [],level =  {},result;
    var re = /#EXT-X-STREAM-INF:([^\n\r]*(BAND)WIDTH=(\d+))?([^\n\r]*(CODECS)=\"(.*)\",)?([^\n\r]*(RES)OLUTION=(\d+)x(\d+))?([^\n\r]*(NAME)=\"(.*)\")?[^\n\r]*[\r\n]+([^\r\n]+)/g;
    while((result = re.exec(string)) != null){
      result.shift();
      result = result.filter(function(n){ return (n !== undefined);});
      level.url = this.resolve(result.pop(),baseurl);
      while(result.length > 0) {
        switch(result.shift()) {
          case 'RES':
            level.width = result.shift();
            level.height = result.shift();
            break;
          case 'BAND':
            level.bitrate = result.shift();
            break;
          case 'NAME':
            level.name = result.shift();
            break;
          case 'CODECS':
            level.codecs = result.shift();
            break;
          default:
            break;
        }
      }
      levels.push(level);
      level = {};
    }
    return levels;
  }

  parseLevelPlaylist(string, baseurl) {
    var currentSN = 0,totalduration = 0, level = { url : baseurl, fragments : [], endList : false}, result, regexp;
    regexp = /(?:#EXT-X-(MEDIA-SEQUENCE):(\d+))|(?:#EXT-X-(TARGETDURATION):(\d+))|(?:#EXT(INF):([\d\.]+)[^\r\n]*[\r\n]+([^\r\n]+)|(?:#EXT-X-(ENDLIST)))/g;
    while((result = regexp.exec(string)) !== null){
      result.shift();
      result = result.filter(function(n){ return (n !== undefined);});
      switch(result[0]) {
        case 'MEDIA-SEQUENCE':
          currentSN = level.startSN = parseInt(result[1]);
          break;
        case 'TARGETDURATION':
          level.targetduration = parseFloat(result[1]);
          break;
        case 'ENDLIST':
          level.endList = true;
          break;
        case 'INF':
          var duration = parseFloat(result[1]);
          level.fragments.push({url : this.resolve(result[2],baseurl), duration : duration, start : totalduration, sn : currentSN++});
          totalduration+=duration;
          break;
        default:
          break;
      }
    }
    //logger.log('found ' + level.fragments.length + ' fragments');
    level.totalduration = totalduration;
    level.endSN = currentSN - 1;
    return level;
  }

  loadsuccess(event) {
    var level,string = event.currentTarget.responseText, url = this.url, id = this.id;
    this.stats.tend = Date.now();

    if(string.indexOf('#EXTM3U') === 0) {
      if (string.indexOf('#EXTINF:') > 0) {
        // 1 level playlist, parse it
        level = this.parseLevelPlaylist(string,url);
        // if first request, fire manifest loaded event beforehand
        if(this.manifestLoaded === false) {
          this.manifestLoaded = true;
          observer.trigger(Event.MANIFEST_LOADED,
                          { levels : [level],
                            url : url,
                            id : id,
                            stats : this.stats});
        }
        observer.trigger(Event.LEVEL_LOADED,
                        { level : level,
                          url : url,
                          id : id,
                          stats : this.stats});
      } else {
        // multi level playlist, parse level info
        this.manifestLoaded = true;
        observer.trigger(Event.MANIFEST_LOADED,
                        { levels : this.parseMasterPlaylist(string,url),
                          url : url ,
                          id : id,
                          stats : this.stats});
      }
    } else {
      observer.trigger(Event.LOAD_ERROR, { url : url, event: 'not an HLS playlist'});
    }
  }

  loaderror(event) {
    observer.trigger(Event.LOAD_ERROR, { url : this.url, event: event});
  }

  loadprogress() {
    if(this.stats.tfirst === undefined) {
      this.stats.tfirst = Date.now();
    }
  }
}

export default PlaylistLoader;
