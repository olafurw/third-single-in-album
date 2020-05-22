// olafur waage - @olafurw on twitter
import * as pg from 'pg';

import * as db from './db';

// https://www.riaa.com/gold-platinum/?advance_search=1&tab_active=awards_by_artist&format_option=singles&type_option=ST#search_section
function ArtistsFromFile(filename: string): number[]
{
    var fs = require('fs');
    const lines = fs.readFileSync(filename).toString().split("\n");

    const numbers = [];
    for (const line of lines)
    {
        numbers.push(parseInt(line));
    }

    return numbers;
}

async function GetAlbums(client: pg.Client, artist: db.Artist): Promise<db.Album[]>
{
    const releaseGroupIds = [];

    // Let's get all the albums
    const albumGroups = await db.GetReleaseGroupAlbums(client, artist.artist_credits);
    for (const albumGroup of albumGroups)
    {
        releaseGroupIds.push(albumGroup.id);
    }

    // And all the releases from those album ids
    const releases = await db.GetReleases(client, artist.artist_credits, releaseGroupIds);
    if (releases.length === 0)
    {
        console.error(`[ERROR] No release found for ${artist.name} (${artist.id})`);
        return [];
    }

    const albums = [];
    const releaseIds = [];

    // And let's connect them together, 1 release for each album
    for (const albumGroup of albumGroups)
    {
        const release = releases.find((r) => r.release_group === albumGroup.id);
        if (!release)
        {
            continue;
        }

        releaseIds.push(release.id);

        const album = new db.Album(albumGroup, release);
        albums.push(album);
    }

    // Then let's find all the tracks and try to add them to the albums found earlier
    const tracks = await db.GetTracksFromReleases(client, releaseIds);
    for (const track of tracks)
    {
        for (const album of albums)
        {
            const tryAdd = album.AddTrack(track);
            if (tryAdd)
            {
                break;
            }
        }
    }

    // Then we find the singles and then try to associate them to an album.
    let singleCount = 0;
    const singles = await db.GetSinglesAlbumRelation(client, artist.artist_credits, releaseGroupIds);
    for (const album of albums)
    {
        album.SortTracks();
        singleCount += album.SetSingles(singles);
    }

    console.log(`Number of singles: ${singleCount}`);

    return albums;
}

async function main()
{
    if (process.argv.length !== 3)
    {
        console.log(`File argument missing.`);
        return;   
    }

    const client = new pg.Client(
    {
        database: 'musicbrainz_db',
        host: 'localhost',
        user: 'musicbrainz',
        password: 'musicbrainz'
    });
    await client.connect();

    console.log(`[INFO] Connected`);

    let singleArray = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    let trackArray = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

    // For every artist id in the file given
    const artists = ArtistsFromFile(process.argv[2]);
    for (const id of artists)
    {
        const artist = await db.GetArtistId(client, id);
        if (!artist)
        {
            console.log(`[ERROR] Artist not found: ${id}`);
            continue;
        }

        const artistCredits = await db.GetArtistCredits(client, artist.id);
        if (artistCredits.length === 0)
        {
            console.log(`[ERROR] No artist credit ids found for artist: ${artist.name} (${artist.id})`);
            continue;
        }
        artist.AddCredits(artistCredits);

        console.log(`Artist: ${artist.name} (${artist.id})`);

        const albumGroups = await db.GetReleaseGroupAlbums(client, artist.artist_credits);
        if (albumGroups.length === 0)
        {
            console.log(`Album Count zero for ${artist.name} (${artist.id})`);
            continue;
        }

        const albumsResult = artist.AddAlbums(await GetAlbums(client, artist));
        if (!albumsResult)
        {
            console.error(`[ERROR] No albums added for ${artist.name} (${artist.id})`);
            continue;
        }

        console.log(`Album count: ${artist.albums.length}`);

        // The count for the track and single array
        for (const album of artist.albums)
        {
            for (let songIndex = 0; songIndex < 20; songIndex++)
            {
                if (album.tracks[songIndex])
                {
                    trackArray[songIndex] += 1;

                    if (album.tracks[songIndex].is_single)
                    {
                        singleArray[songIndex] += 1;
                    }
                }
            }
        }
    }

    console.log(trackArray);
    console.log(singleArray);

    await client.end();
}

main().catch(console.error);