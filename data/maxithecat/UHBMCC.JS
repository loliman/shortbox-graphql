
function loadPage()
{
	//alert(document.location.href);
	//RestoreSkinColor();
}

function loadPageNaviVE()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			var h = top.frames.N.location.hash;
			top.frames.C.location.href = "VERLAGALL.HTM"+h;
			if (h == "")
			{
				top.frames.S.location.href = "EMPTY.HTM";
				top.frames.I.location.href = "EMPTY.HTM";
			}
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviDSD()
{
	loadPage();
	loadPageNaviXS("#d", "byDate", "D", "N", "DT");
}

function loadPageNaviDSN()
{
	loadPage();
	loadPageNaviXS("#n", "byName", "N", "D", "DT");
}

function loadPageNaviUSD()
{
	loadPage();
	loadPageNaviXS("#d", "byDate", "D", "N", "US");
}

function loadPageNaviUSN()
{
	loadPage();
	loadPageNaviXS("#n", "byName", "N", "D", "US");
}

function loadPageNaviXS(ordHash, ordCookie, order1, order2, ctry)
{
	try
	{
		var cookie = "UHBMCC2";
		if (ctry == "US")
			cookie = "UHBMCC3";
			
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			var _SerNr, _Let, _GrpNr, _File;
			_SerNr = "";
			_Let = "";
			_GrpNr = "";
			_File = "";

			if (top.frames.N.location.hash == ordHash)
			{
				SetCookie(cookie, ordCookie);
			}
			else if (top.frames.N.location.search != "")
			{
				var _p = top.frames.N.location.search;
				var _q = _p.indexOf("SerNr=");
				if (_q != -1 )
				{
					_SerNr = _p.substr(_q+6, _p.length);
					_q = _SerNr.indexOf("&");
					if (_q != -1)
					{
						_SerNr = _SerNr.substr(0, _q);
					}
				}
				_q = _p.indexOf("Let=");
				if (_q != -1 )
				{
					_Let = _p.substr(_q+4, _p.length);
					_q = _Let.indexOf("&");
					if (_q != -1)
					{
						_Let = _Let.substr(0, _q);
					}
				}
				_q = _p.indexOf("GrpNr=");
				if (_q != -1 )
				{
					_GrpNr = _p.substr(_q+6, _p.length);
					_q = _GrpNr.indexOf("&");
					if (_q != -1)
					{
						_GrpNr = _GrpNr.substr(0, _q);
					}
				}
				_q = _p.indexOf("File=");
				if (_q != -1 )
				{
					_File = _p.substr(_q+5, _p.length).toLowerCase();
					_q = _File.indexOf("&");
					if (_q != -1)
					{
						_File = _File.substr(0, _q);
					}
				}
			}

			var ord = GetCookie(cookie);
			//alert(_SerNr + "::" + _Let + "::" + _GrpNr + "::" + _File + "::" + ord + "::" + ordCookie);
			if (_SerNr == "" || _Let == "" || _GrpNr == "" || _File == "")
			{
				if (ord == ordCookie || ord == "")
				{
					top.frames.C.location.href = ctry + "SERALL" + order1 + ".HTM";
				}
				else
				{
					top.frames.N.location.href = "NAVI" + ctry.substr(0,1) + "S" + order2 + ".HTM";
					top.frames.C.location.href = ctry + "SERALL" + order2 + ".HTM";
				}
				top.frames.S.location.href = "EMPTY.HTM";
				top.frames.I.location.href = "EMPTY.HTM";
			}
			else
			{
				//alert("2::" + ord + "::" + ordCookie + "::" + order1 + "::" + order2);
				var _Let2 = _Let.toLowerCase();
				if (_Let == "NR")
					_Let2 = '9';

				if (ord == ordCookie)
				{
					top.frames.C.location.href = ctry + "SERALL" + order1 + ".HTM#" + _Let;
					top.frames.S.location.href = ctry + "SER" + _Let2 + order1 + ".HTM#G" + _GrpNr;
				}
				else
				{
					top.frames.N.location.href = "NAVI" + ctry.substr(0,1) + "S" + order2 + ".htm";
					top.frames.C.location.href = ctry + "SERALL" + order2 + ".HTM#" + _Let;
					top.frames.S.location.href = ctry + "SER" + _Let2 + order2 + ".HTM#G" + _GrpNr;
				}
				top.frames.I.location.href = _File + ".HTM#S" + _SerNr;
			}
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviDG()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			var h = top.frames.N.location.hash;
			top.frames.C.location.href = "DTSAALL.HTM"+h;
			if (h == "")
			{
				top.frames.S.location.href = "EMPTY.HTM";
				top.frames.I.location.href = "EMPTY.HTM";
			}
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviUG()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			var h = top.frames.N.location.hash;
			top.frames.C.location.href = "USSAALL.HTM"+h;
			if (h == "")
			{
				top.frames.S.location.href = "EMPTY.HTM";
				top.frames.I.location.href = "EMPTY.HTM";
			}
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviUN()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			top.frames.C.location.href = "USNAMALL.HTM";
			top.frames.S.location.href = "EMPTY.HTM";
			top.frames.I.location.href = "EMPTY.HTM";
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviDD()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			top.frames.C.location.href = "DTDATALL.HTM";
			top.frames.S.location.href = "EMPTY.HTM";
			top.frames.I.location.href = "EMPTY.HTM";
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviUD()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			top.frames.C.location.href = "USDATALL.HTM";
			top.frames.S.location.href = "EMPTY.HTM";
			top.frames.I.location.href = "EMPTY.HTM";
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviUR()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			var h = top.frames.N.location.hash;
			top.frames.C.location.href = "USREPALL.HTM"+h;
			if (h == "")
			{
				top.frames.S.location.href = "EMPTY.HTM";
				top.frames.I.location.href = "EMPTY.HTM";
			}
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviDC()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			top.frames.C.location.href = "DTCHALL.HTM";
			top.frames.S.location.href = "EMPTY.HTM";
			top.frames.I.location.href = "EMPTY.HTM";
		}
	}
	catch (e)
	{
	}
}

function loadPageNaviUC()
{
	loadPage();

	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			top.frames.C.location.href = "USCHALL.HTM";
			top.frames.S.location.href = "EMPTY.HTM";
			top.frames.I.location.href = "EMPTY.HTM";
		}
	}
	catch (e)
	{
	}
}

function GetCookie(Key)
{
	var Value = "";
	if(document.cookie) 
	{
		var ckon = true;
		if (navigator.cookieEnabled)
		ckon = navigator.cookieEnabled;
		if (ckon)
		{
			var ck = document.cookie;
			var cka = ck.split("; ")
			var i = 0;
			while (i < cka.length)
			{
				var ckk = cka[i].substring(0,cka[i].indexOf("="));
				if (ckk == Key)
				break;
				i++;
			}
			if (i < cka.length)
			{
				Value = cka[i].substring(cka[i].indexOf("=")+1,cka[i].length);
			}
		}
	}
	return Value;
}

function SetCookie(Key, Value)
{
	var ckon = true;
	if (navigator.cookieEnabled)
	ckon = navigator.cookieEnabled;
	if (ckon)
	{
		var ExpTime = 1000*60*60*24*365;
		var Now = new Date();
		var TimeOut = new Date(Now.getTime() + ExpTime);
		document.cookie = Key+"="+Value+"; expires="+TimeOut.toGMTString()+";";
	}
}

function Search(Ctry, Ord)
{
	loadPage();

	var params = location.search;
	if (params.length > 0)
	{
		params = params.substr(1);
		SetCookie("UHBMCC4", params);
		if (top.frames.length > 0)
		{
			top.frames.S.location.href = Ctry + "SERSRC" + Ord + "2.HTM";
		}
		else
		{
			window.location.href = Ctry + "SERSRC" + Ord + "2.HTM";
		}
	}
}

function Search2()
{
	loadPage();

	// Remove children of result node
	var resNode = document.getElementById("resnod");
	while (chldNode = resNode.firstChild)
	{
		resNode.removeChild(chldNode);
	}

	var params = GetCookie("UHBMCC4");
	if (params.length > 0)
	{
		var paramList = params.split('&');
		var wrdList=new Array();
		var op = 0;
		for (i = 0; i < paramList.length; i++)
		{
			var par = paramList[i];
			if (par=="o=o")
			{
				op = 1;
			}
			else if (par.substr(0,2)=="t=")
			{
				var txt = par.substr(2).toLowerCase();
				if (txt.length > 0)
					wrdList = txt.split("+");
			}
		}
		if (wrdList.length>0)
		{
			var aList = document.getElementById("Data").getElementsByTagName("A");
			var resNode = document.getElementById("resnod");
			for (i = 0; i < aList.length; i++)
			{
				aNode=aList[i];
				var fnd=0;
				var ndText=aNode.title.toLowerCase();
				if (op==0) fnd=1;
				for (var j = 0; j < wrdList.length; j++)
				{
					var inx = ndText.indexOf(wrdList[j]);
					if (inx>=0)
					{
						if (op==1)
						{
							fnd=1;
							break;
						}
					}
					else
					{
						if (op==0)
						{
							fnd=0;
							break;
						}
					}
				}
				if (fnd==1)
				{
					aNode.innerHTML = aNode.title;
					var imgNode = aNode.nextSibling;
					var brNode = imgNode.nextSibling;
					if (imgNode.nodeName.toLowerCase() == "br")
					{
						brNode = imgNode;
						imgNode = null;
					}
					resNode.appendChild(aNode.cloneNode(true));
					if (imgNode) resNode.appendChild(imgNode.cloneNode(true));
					resNode.appendChild(brNode.cloneNode(true));
				}
			}
		}
	}
}

function SetSkinColor(Farbe)
{
	SetCookie("UHBMCC", Farbe);
	//RestoreSkinColor();
}

function GetSkinColor()
{
	var val = GetCookie("UHBMCC");
	if (val && val.length <= 10)
	return val;
	else
	return "BK";
}

function RestoreSkinColor()
{
	if (document.getElementById)
	{
		var aLink = document.getElementById("cst");
		if (aLink)
		{
			var i = aLink.href.lastIndexOf(".");
			aLink.href = aLink.href.substr(0, i - 2) + GetSkinColor() + ".CSS";
		}
	}
}

function bs(Button, State)
{
	if (document.getElementById)
	{
		var skin = GetSkinColor();
		var elem = document.getElementById(Button+"s");
		//var skin = elem.style.backgroundImage.substr(0,6);
		elem.style.backgroundImage = "url("+skin+State+"s.gif)";
		elem = document.getElementById(Button+"m");
		elem.style.backgroundImage = "url("+skin+State+"m.gif)";
		var elem = document.getElementById(Button+"e");
		elem.style.backgroundImage = "url("+skin+State+"e.gif)";
	}
}

function ls(Letter, State)
{
	if (document.getElementById)
	{
		var skin = GetSkinColor();
		var elem = document.getElementById(Letter);
		//var skin = elem.style.backgroundImage.substr(0,6);
		elem.style.backgroundImage = "url("+skin+State+"m.gif)";
	}
}

function show(Elem, State)
{
	if (document.getElementById)
	{
		document.getElementById(Elem).style.display = State ? "inline" : "none";
	}
}

function showAll(State)
{
	if (document.getElementsByTagName)
	{
		var aDivs = document.getElementsByTagName("div")
		for (var i = 0; i < aDivs.length; i++)
		{
			var aDiv = aDivs[i];
			if (aDiv.id.length > 0 && aDiv.id.substr(0,4)=="togg")
			{
				aDiv.style.display = State ? "inline" : "none";
			}
		}
	}
}

function loadPageSel()
{
	if (top.frames.length == 0)
	{
		//InclMenu();
		ClearTarget();
	}
	
	loadPage();
}

function loadPageSA(Ctry, Letter)
{
	loadPageSel();

	try
	{
		if (Letter != "" && top.frames.length > 0 && top.frames[0].name == "T")
		{
			var _p = top.frames.S.location.search;
			if (_p.length == 0)
			{
				var Seite = decodeURI(top.frames.N.location.href);
				Seite = Seite.substr(Seite.lastIndexOf('/')+1);
				if (Seite.substr(0,4) == "NAVI")
				{
					var naviFile = "NAVI" + Ctry.substr(0,1) + "G";
					if (Seite.substr(0,5) != naviFile)
					{
						top.frames.N.location.href = naviFile +".HTM#"+Letter;
					}
					else
					{
						top.C.location.href = Ctry + "SAALL.HTM#"+Letter;
					}
				}
			}
		}
	}
	catch (e)
	{
	}
}

function loadPageRep(Ctry, Letter)
{
	loadPageSel();

	try
	{
		if (Letter != "" && top.frames.length > 0 && top.frames[0].name == "T")
		{
			var _p = top.frames.S.location.search;
			if (_p.length == 0)
			{
				var Seite = decodeURI(top.frames.N.location.href);
				Seite = Seite.substr(Seite.lastIndexOf('/')+1);
				if (Seite.substr(0,4) == "NAVI")
				{
					var naviFile = "NAVI" + Ctry.substr(0,1) + "R";
					if (Seite.substr(0,5) != naviFile)
					{
						top.frames.N.location.href = naviFile +".HTM#"+Letter;
					}
					else
					{
						top.frames.C.location.href = Ctry + "REPALL.HTM#"+Letter;
					}
				}
			}
		}
	}
	catch (e)
	{
	}
}

function loadPageData()
{
	if (top.frames.length == 0)
	{
		//InclMenu();
		ClearTarget();
	}

	loadPage();
	startmousewatch();

	/*
	var show = false;
	var _Hash = document.location.hash;
	var _HashLen = _Hash.length;
	if (_HashLen > 0)
	{
		var _HashEnd = _Hash.substr(_HashLen-2);
		if (_HashEnd == "FT")
		{
			show = true;
		}
	}
	
	showAll(show);
	*/
}

function loadPageDataFr()
{
	loadPage();

	/*
	try
	{
		if (top.frames.length > 0 && top.frames[0].name == "T")
		{
			var _Par = top.location.search;
			if (_Par != "")
			{
				var ord = GetCookie("UHBMCC2");
				if (ord == "byDate")
				   navo = "d";
				else
				   navo = "n";
				  
				top.frames.N.location.href = "navic" + navo + ".htm" + _Par;
			}
		}
	}
	catch (e)
	{
	}
	*/
}

function noEnter(e)
{
	var key;     
	if(window.event)
		key = window.event.keyCode; //IE
	else
		key = e.which; //firefox

	if (key == 13)
	{
		applyFilter();
		return false;
	}
	else
		return true;
}

function applyFilter()
{
	removeFilterResults();

	var txt = document.getElementById("filtxt").value.toLowerCase();
	if (txt.length == 0)
		return;
		
	// Show result table
	document.getElementById("restab").style.display = "inline";

	var resNode = document.getElementById("resnod");

	var rba = document.getElementById("rbtall").checked;
	var rbo = document.getElementById("rbtany").checked;
	var op = 0;
	if (rbo == true)
		op = 1;
	
	var wrdList = txt.split(' ');
	if (wrdList.length > 0)
	{
		var aList = document.getElementsByTagName("A");
		for (i = 0; i < aList.length; i++)
		{
			aNode = aList[i];
			if (aNode.firstChild && aNode.target.toLowerCase() != "c")
			{
				var fnd = 0;
				var ndText = aNode.firstChild.data.toLowerCase();
				if (op == 0) fnd = 1;
				for (var j = 0; j < wrdList.length; j++)
				{
					var inx = ndText.indexOf(wrdList[j]);
					if (inx >= 0)
					{
						if (op == 1)
						{
							fnd = 1;
							break;
						}
					}
					else
					{
						if (op == 0)
						{
							fnd=0;
							break;
						}
					}
				}
				if (fnd == 1)
				{
					resNode.appendChild(aNode.cloneNode(true));
					var brNode = document.createElement("br");
					resNode.appendChild(brNode);
					i++;
				}
			}
		}
	}
	
}

function removeFilterResults()
{
	// Hide result table
	document.getElementById("restab").style.display = "none";

	// Remove children of result node
	var resNode = document.getElementById("resnod");
	while (chldNode = resNode.firstChild)
	{
		resNode.removeChild(chldNode);
	}
}

function ClearTarget()
{
	var doclinks = document.getElementsByTagName("base");
	for (var i = 0; i < doclinks.length; i++)
	{
		doclinks[i].target = "_self";
	}
	
	doclinks = document.getElementsByTagName("a");
	for (var i = 0; i < doclinks.length; i++)
	{
		if (doclinks[i].target.toLowerCase() != "_blank")
			doclinks[i].target = "_self";
	}
}

function loadPageShowCover()
{
	loadPage();
	
	var _par = location.search;
	if (_par != "")
	{
		var _p = _par;
		var _q = _p.indexOf("titel=");
		if (_q != -1 )
		{
			var tit = _p.substr(_q+6, _p.length);
			_q = tit.indexOf("&");
			if (_q != -1)
			{
				tit = tit.substr(0, _q);
			}
		
			var titNode = document.getElementById("Titel");
			titNode.innerHTML = decodeURIComponent(tit);
		}
		
		_q = _p.indexOf("cover=");
		if (_q != -1 )
		{
			var cvr = _p.substr(_q+6, _p.length);
			_q = cvr.indexOf("&");
			if (_q != -1)
			{
				cvr = cvr.substr(0, _q);
			}
		
			var cvrNode = document.getElementById("Cover");
			cvrNode.src = decodeURIComponent(cvr);
		}
	}
}


/*
Pop up information box II (Mike McGrath (mike_mcgrath@lineone.net,  http://website.lineone.net/~mike_mcgrath))
Adapted by Markus Müller (maelmill@Eunet.at, http://www.maelmill-insi.de/)
*/

var Xoffset = 50;    // modify these values to ...
var Yoffset = -50;    // change the popup position.
var mouseX = 0, mouseY = 0;

var lyrs = false, old = false, dall = false, gbid = false;
if (document.getElementById)
{
   gbid = true;
}
else if (document.all)
{
   dall = true;
}
else
{
   (document.layers)?lyrs=true:old=true;
}

var nav = false, opr = false;
if(navigator.appName=="Netscape")
{
   nav = true;
}
var AgntUsr=navigator.userAgent.toLowerCase();
var opr=AgntUsr.indexOf('opera')!=-1?true:false;

//alert(gbid + '-' + dall + '-' + lyrs + '-' + old + '-' + nav + '-' + navigator.userAgent);

function getDiv(Layer)
{
   if (gbid)
      return document.getElementById(Layer).style;
   if (dall)
      return document.all[Layer].style;
   if (lyrs)
      return document[Layer];
   return null;
}

function startmousewatch()
{
   if(!old)
   {
      var d = document;
      if (top.frames.length > 0 && top.frames[0].name == "T")
      {
         d = top.frames.I.document;
      }   

      //if(nav)
      //   d.captureEvents(Event.MOUSEMOVE);
      // d.onmousemove=get_mouse;
	  addEvent (d, "mousemove", get_mouse );
   }
}

var cvrDiv = 0;

function popup(issueID, ImageSrc)
{
   if(!old)
   {
	  if (cvrDiv)
	     kill();
		 
		var cvrNode = document.getElementById(issueID);
		cvrNode = cvrNode.parentNode;
		cvrNode = cvrNode.parentNode;
		do
		{
			cvrNode = cvrNode.nextSibling;
		} while (cvrNode.nodeName.toUpperCase() != "TR");
		cvrNode = cvrNode.firstChild;
		cvrNode = cvrNode.nextSibling;
		cvrNode = cvrNode.nextSibling;
		 
		if (cvrNode)
		{
			var cvrDiv2 = document.createElement("div");
			var pic = document.createElement("img");
			pic.src = ImageSrc;
			cvrDiv2.appendChild(pic);
			cvrDiv2.style.position = "relative";
			cvrDiv2.style.left = "0px";
			cvrDiv2.style.top  = "0px";
			if (cvrNode.childNodes.length == 1)
			{
				cvrNode.appendChild(cvrDiv2);
				//cvrNode.insertBefore(cvrDiv2, cvrNode.firstChild);
			}
		}
		else
		{
			cvrDiv = document.createElement("div");
			var pic = document.createElement("img");
			pic.src = ImageSrc;
			cvrDiv.appendChild(pic);
			cvrDiv.style.position = "absolute";
			cvrDiv.style.left = mouseX + Xoffset + "px";
			cvrDiv.style.top  = mouseY + Yoffset + "px";
			document.body.appendChild(cvrDiv);
		}
      if (nav && lyrs)
      {
         cvrDiv2.visibility = "show";
      }
      else
      {
         cvrDiv2.visibility = "visible";
      }
   }
}

function get_mouse(e)
{
   if (nav)
   {
	  mouseX = e.pageX;
	  mouseY = e.pageY;
   }
   else if (opr)
   {
	  mouseX = event.x;
	  mouseY = event.y;
   }
   else
   {
	  mouseX = event.x+document.body.scrollLeft;
	  mouseY = event.y+document.body.scrollTop;
   }

   if (cvrDiv)
   {
	   if (cvrDiv.top > 0)
	   {
		  cvrDiv.left = mouseX + Xoffset;
		  cvrDiv.top  = mouseY + Yoffset;
	   }
	}
   //status = mouseY + '/' + mouseX + '/' + skn.top + '/' + skn.left;
}

function kill()
{
	if(!old)
	{
		if (cvrDiv)
		{
			var parNode = cvrDiv.parentNode;
			parNode.removeChild(cvrDiv);
			cvrDiv = 0;
		}
   }
}

function ShowCover(issueID, Cover)
{
	// Titel bestimmen
	var parNode = document.getElementById(issueID);
	while (parNode.nodeName.toUpperCase() != "DIV" || parNode.className.toUpperCase() != "LQB")
	{
		parNode = parNode.parentNode;
	}
	
	var titNode = parNode.previousSibling.firstChild.firstChild;
	var tit = titNode.innerHTML;
	var _q = tit.indexOf("<");
	if (_q != -1 )
	{
		tit = tit.substr(0, _q);
	}

	_q = issueID.indexOf("N");
	if (_q != -1 )
	{
		tit = tit + " #" + issueID.substr(_q+1, issueID.length);
	}

	location.href = "SHOWCVR.HTM?titel=" + encodeURIComponent(tit) + "&cover=" + encodeURIComponent(Cover);
}


// Taken from http://www.quirksmode.org/blog/archives/2005/10/_and_the_winner_1.html
// Created by John Resig

function addEvent( obj, type, fn )
{
	if (obj.addEventListener)
		obj.addEventListener( type, fn, false );
	else if (obj.attachEvent)
	{
		obj["e"+type+fn] = fn;
		obj[type+fn] = function() { obj["e"+type+fn]( window.event ); }
		obj.attachEvent( "on"+type, obj[type+fn] );
	}
}

function removeEvent( obj, type, fn )
{
	if (obj.removeEventListener)
		obj.removeEventListener( type, fn, false );
	else if (obj.detachEvent)
	{
		obj.detachEvent( "on"+type, obj[type+fn] );
		obj[type+fn] = null;
		obj["e"+type+fn] = null;
	}
}
