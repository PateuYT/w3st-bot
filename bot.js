require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ✅ Rolul care are voie să genereze
const ALLOWED_ROLE_ID = '1474504134656004199';

// Generează cheie random W3ST-XXXX-XXXX-XXXX (ca în codul tău original)
function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `W3ST-${segment()}-${segment()}-${segment()}`;
}

function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Comenzi Slash
const commands = [
  new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Generează chei de licență W3ST')
    .addIntegerOption(option =>
      option
        .setName('days')
        .setDescription('Număr de zile (default: 30)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)
    )
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('Câte chei să genereze')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('keys')
    .setDescription('Vezi ultimele chei generate')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('Revocă o cheie')
    .addStringOption(option =>
      option.setName('key').setDescription('Cheia de revocat').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

// Deploy commands (la pornire)
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logat ca ${client.user.tag}`);

  try {
    await client.application.commands.set(commands);
    console.log('✅ Comenzi înregistrate!');
    console.log('ℹ️ Dacă nu vezi opțiunea count, așteaptă câteva secunde sau dă restart botului.');
  } catch (error) {
    console.error('❌ Eroare la înregistrarea comenzilor:', error);
  }
});

// Handler comenzi
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // =========================
  // /generate
  // =========================
  if (interaction.commandName === 'generate') {
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ Comanda poate fi folosită doar pe server!',
        ephemeral: true,
      });
    }

    // verifică rol
    let member;
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch (err) {
      return interaction.reply({
        content: '❌ Eroare la verificarea rolului!',
        ephemeral: true,
      });
    }

    if (!member.roles.cache.has(ALLOWED_ROLE_ID)) {
      return interaction.reply({
        content: '❌ Nu ai rolul necesar pentru a genera chei!',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // default 30 (cum aveai tu)
    let days = interaction.options.getInteger('days') ?? 30;

    // count (obligatoriu)
    const count = interaction.options.getInteger('count');
    if (!count || count < 1) {
      return interaction.editReply({ content: '❌ Număr invalid de chei!' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    // generează cheile
    const keys = Array.from({ length: count }, () => generateKey());

    // insert bulk supabase
    const rows = keys.map(k => ({
      key: k,
      duration_days: days,
      expires_at: expiresAt.toISOString(),
      created_by: interaction.user.id,
    }));

    const { error } = await supabase.from('license_keys').insert(rows);

    if (error) {
      console.error('❌ Supabase error:', error);
      return interaction.editReply({
        content: `❌ Eroare la salvare: ${error.message}`,
      });
    }

    // confirmare privată
    await interaction.editReply({
      content: `✅ Am generat **${count}** chei și le-am trimis în canal!`,
    });

    const header = `W3ST keys (${count}) | Duration: ${days} days | Expires: ${formatDate(expiresAt)}\n`;

    // dacă sunt mai mult de 100 -> fișier .txt
    if (count > 100) {
      const content = header + keys.join('\n') + '\n';
      const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
        name: `keys_${count}_${days}days.txt`,
      });

      await interaction.channel.send({
        content: `📄 Am generat **${count}** chei. Le găsești în fișierul atașat.\nExpires: **${formatDate(expiresAt)}**`,
        files: [file],
      });
    } else {
      // <= 100 -> mesaj (cu fallback dacă depășește limita de 2000)
      const body = keys.join('\n');
      const msg = `${header}\`\`\`\n${body}\n\`\`\``;

      if (msg.length > 1900) {
        const content = header + body + '\n';
        const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
          name: `keys_${count}_${days}days.txt`,
        });

        await interaction.channel.send({
          content: `📄 Cheile sunt prea multe pentru un singur mesaj, le-am pus în fișier.\nExpires: **${formatDate(expiresAt)}**`,
          files: [file],
        });
      } else {
        await interaction.channel.send(msg);
      }
    }

    // log opțional
    try {
      const logChannel = interaction.guild.channels.cache.find(c => c.name === 'license-logs');
      if (logChannel) {
        await logChannel.send({
          embeds: [
            {
              color: 0x22c55e,
              description: `✅ **${interaction.user.tag}** a generat **${count}** chei de **${days} zile**`,
            },
          ],
        });
      }
    } catch (e) {}
  }

  // =========================
  // /keys
  // =========================
  if (interaction.commandName === 'keys') {
    await interaction.deferReply({ ephemeral: true });

    const { data: keys, error } = await supabase
      .from('license_keys')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !keys || keys.length === 0) {
      return interaction.editReply('Nu există chei sau a apărut o eroare.');
    }

    const list = keys
      .map(k => {
        const status = k.used ? '🔴 Folosită' : '🟢 Liberă';
        return `\`${k.key}\` - ${k.duration_days}z - ${status}`;
      })
      .join('\n');

    await interaction.editReply({
      embeds: [
        {
          color: 0x3b82f6,
          title: '📋 Ultimele 10 chei',
          description: list,
          timestamp: new Date(),
        },
      ],
    });
  }

  // =========================
  // /revoke
  // =========================
  if (interaction.commandName === 'revoke') {
    const key = interaction.options.getString('key').toUpperCase();

    const { error } = await supabase.from('license_keys').delete().eq('key', key);

    if (error) {
      return interaction.reply({ content: '❌ Eroare la ștergere!', ephemeral: true });
    }

    await interaction.reply({
      content: `✅ Cheia \`${key}\` a fost revocată!`,
      ephemeral: true,
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
